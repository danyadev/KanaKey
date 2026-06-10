#!/usr/bin/env python3
"""Build KanaKey's JLPT word list.

Default output is N5 + N4 because N5 alone is too small for katakana practice.

Generated JSON order is KanaKey's word rank:
earlier entries are treated as more useful/common during batch generation.

Sources:
- JLPT membership seed: stephenmk/yomitan-jlpt-vocab
- Meanings and JMdict commonness signals: scriptin/jmdict-simplified English JMdict JSON release asset
- Actual popularity ordering: wordfreq Japanese Zipf frequency

Install frequency dependency:
  python3 -m pip install "wordfreq[cjk]"
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


try:
    from wordfreq import zipf_frequency
except ImportError:
    zipf_frequency = None


YOMITAN_URL_TEMPLATE = (
    "https://raw.githubusercontent.com/stephenmk/yomitan-jlpt-vocab/main/"
    "yomitan-jlpt-vocab/term_meta_bank_{bank}.json"
)

JMDICT_RELEASE_API_URL = "https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest"

LEVEL_TO_BANK = {
    "N1": 1,
    "N2": 2,
    "N3": 3,
    "N4": 4,
    "N5": 5,
}

LEVEL_SCORE = {
    "N5": 0,
    "N4": 1,
    "N3": 2,
    "N2": 3,
    "N1": 4,
}

HIRAGANA_RE = re.compile(r"^[\u3040-\u3096]+$")
KATAKANA_RE = re.compile(r"^[\u30A0-\u30FAー]+$")

PRIORITY_TAG_SCORE = {
    "news1": 0,
    "ichi1": 0,
    "spec1": 1,
    "gai1": 2,
    "news2": 3,
    "ichi2": 3,
    "spec2": 4,
    "gai2": 5,
}

# Only used when the word is already present in the Yomitan JLPT source.
# These are dictionary-resolution fixes, not extra filler words.
MEANING_OVERRIDES: dict[tuple[str | None, str], str] = {
    (None, "あそこ"): "over there",
    (None, "あちら"): "that way, over there",
    (None, "あっち"): "over there, that way",
    (None, "いる"): "to be, to exist",
    (None, "カレー"): "curry",
    (None, "キログラム"): "kilogram",
    (None, "キロメートル"): "kilometer",
    (None, "グラム"): "gram",
    (None, "コーヒー"): "coffee",
    (None, "ここ"): "here",
    (None, "こちら"): "this way, here",
    (None, "この"): "this",
    (None, "しかし"): "however, but",
    (None, "ズボン"): "trousers, pants",
    (None, "する"): "to do",
    (None, "そうして"): "and then, like that",
    (None, "そして"): "and, and then",
    (None, "そこ"): "there",
    (None, "そちら"): "that way, there",
    (None, "そっち"): "that way, there",
    (None, "その"): "that",
    (None, "それから"): "after that, and then",
    (None, "それでは"): "well then, in that case",
    (None, "ちょっと"): "a little, a bit",
    (None, "どうして"): "why, how",
    (None, "どちら"): "which way, which one",
    (None, "どっち"): "which way, which one",
    (None, "とても"): "very, extremely",
    (None, "どの"): "which",
    (None, "どれ"): "which one",
    (None, "ボタン"): "button",
    (None, "また"): "again, also",
    (None, "メートル"): "meter",
    (None, "やる"): "to do, to give",
}


@dataclass(frozen=True)
class DictionaryMatch:
    meaning: str
    priority_score: int


@dataclass(frozen=True)
class SourceTerm:
    source_index: int
    level: str
    term: str
    reading: str


@dataclass(frozen=True)
class ImportedEntry:
    source_index: int
    frequency_score: float
    priority_score: int
    level_score: int
    data: dict[str, str]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--levels",
        nargs="+",
        choices=["N5", "N4", "N3", "N2", "N1"],
        default=["N5", "N4"],
        help="JLPT levels to import. Defaults to N5 N4.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("src/words.json"),
        help="Path to write. Defaults to src/words.json.",
    )
    parser.add_argument(
        "--yomitan-dir",
        type=Path,
        help="Optional local dir containing term_meta_bank_5.json, term_meta_bank_4.json, etc.",
    )
    parser.add_argument(
        "--jmdict-json",
        type=Path,
        help="Use a local jmdict-simplified JSON file instead of downloading the latest release asset.",
    )
    parser.add_argument(
        "--common-jmdict",
        action="store_true",
        help="Download the smaller common-only English JMdict asset. Faster, but may miss JLPT entries.",
    )
    parser.add_argument(
        "--allow-missing",
        action="store_true",
        help="Write the list even if some JLPT entries cannot be resolved in JMdict.",
    )
    args = parser.parse_args()

    if zipf_frequency is None:
        print(
            "Missing wordfreq.\n"
            "Install it with:\n"
            '  python3 -m pip install "wordfreq[cjk]"',
            file=sys.stderr,
        )
        return 1

    levels = normalize_levels(args.levels)

    source_terms: list[SourceTerm] = []
    for level in levels:
        rows = load_yomitan_rows(level, args.yomitan_dir)
        source_terms.extend(iter_jlpt_terms(rows, level, source_offset=len(source_terms)))

    jmdict = load_jmdict(args.jmdict_json, common_jmdict=args.common_jmdict)
    dictionary_index = build_dictionary_index(jmdict)

    best_by_kana: dict[str, ImportedEntry] = {}
    missing_meanings: list[tuple[str, str | None, str]] = []
    skipped_scripts: list[tuple[str, str | None, str]] = []

    for source_term in source_terms:
        term = source_term.term
        reading = source_term.reading
        script = script_for(reading)
        kanji = None if is_kana_only(term) else term

        if script is None:
            skipped_scripts.append((source_term.level, kanji, reading))
            continue

        match = find_dictionary_match(dictionary_index, kanji, reading)
        if match is None:
            override = MEANING_OVERRIDES.get((kanji, reading)) or MEANING_OVERRIDES.get((None, reading))
            if override is not None:
                match = DictionaryMatch(override, 50)

        if match is None:
            missing_meanings.append((source_term.level, kanji, reading))
            continue

        entry = {
            "script": script,
            "kana": reading,
        }
        if kanji is not None:
            entry["kanji"] = kanji
        entry["meaning"] = match.meaning
        entry["jlpt"] = source_term.level

        candidate = ImportedEntry(
            source_index=source_term.source_index,
            frequency_score=frequency_score(term, reading),
            priority_score=match.priority_score,
            level_score=LEVEL_SCORE[source_term.level],
            data=entry,
        )

        # KanaKey trains kana typing, so multiple spellings with the same kana
        # are the same exercise. Keep the best-ranked representative.
        existing = best_by_kana.get(reading)
        if existing is None or imported_entry_sort_key(candidate) < imported_entry_sort_key(existing):
            best_by_kana[reading] = candidate

    if skipped_scripts:
        print("Skipped entries with unsupported kana script:", file=sys.stderr)
        for level, kanji, kana in skipped_scripts[:40]:
            label = f"{kanji}【{kana}】" if kanji else kana
            print(f"  - {level}: {label}", file=sys.stderr)
        if len(skipped_scripts) > 40:
            print(f"  ... and {len(skipped_scripts) - 40} more", file=sys.stderr)

    if missing_meanings:
        print("Missing JMdict meanings for these JLPT entries:", file=sys.stderr)
        for level, kanji, kana in missing_meanings[:80]:
            label = f"{kanji}【{kana}】" if kanji else kana
            print(f"  - {level}: {label}", file=sys.stderr)
        if len(missing_meanings) > 80:
            print(f"  ... and {len(missing_meanings) - 80} more", file=sys.stderr)

        if not args.allow_missing:
            print("\nRefusing to write a partial list.", file=sys.stderr)
            print("Use --allow-missing if you want to skip unresolved entries.", file=sys.stderr)
            return 1

    imported = list(best_by_kana.values())

    entries = [
        entry.data
        for entry in sorted(imported, key=imported_entry_sort_key)
    ]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(format_compact_json_array(entries), encoding="utf-8")

    level_label = "+".join(levels)
    print(f"Wrote {len(entries)} {level_label} words to {args.output}")

    print_top_frequency_preview(imported)
    return 0


def normalize_levels(levels: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    for level in levels:
        normalized = level.upper()
        if normalized not in LEVEL_TO_BANK:
            raise ValueError(f"Unsupported JLPT level: {level}")
        if normalized not in seen:
            seen.add(normalized)
            result.append(normalized)

    # Easier levels first for duplicate handling.
    return sorted(result, key=lambda level: LEVEL_SCORE[level])


def load_yomitan_rows(level: str, yomitan_dir: Path | None) -> list[Any]:
    bank = LEVEL_TO_BANK[level]

    if yomitan_dir is not None:
        path = yomitan_dir / f"term_meta_bank_{bank}.json"
        return json.loads(path.read_text(encoding="utf-8"))

    url = YOMITAN_URL_TEMPLATE.format(bank=bank)
    return json.loads(download_text(url))


def load_jmdict(local_path: Path | None, *, common_jmdict: bool) -> dict[str, Any]:
    if local_path is not None:
        return json.loads(local_path.read_text(encoding="utf-8"))

    release = json.loads(download_text(JMDICT_RELEASE_API_URL))
    asset_url = find_jmdict_asset_url(release.get("assets", []), common_jmdict=common_jmdict)
    archive = download_bytes(asset_url)

    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        json_names = [name for name in zipped.namelist() if name.endswith(".json")]
        if not json_names:
            raise RuntimeError(f"No JSON file found in {asset_url}")

        with zipped.open(json_names[0]) as handle:
            return json.load(io.TextIOWrapper(handle, encoding="utf-8"))


def find_jmdict_asset_url(assets: list[dict[str, Any]], *, common_jmdict: bool) -> str:
    if common_jmdict:
        preferred = [
            asset
            for asset in assets
            if asset_name(asset).startswith("jmdict-eng-common-")
            and asset_name(asset).endswith(".json.zip")
        ]
    else:
        preferred = [
            asset
            for asset in assets
            if asset_name(asset).startswith("jmdict-eng-")
            and "common" not in asset_name(asset)
            and asset_name(asset).endswith(".json.zip")
        ]

    fallback = [
        asset
        for asset in assets
        if asset_name(asset).startswith("jmdict-eng-")
        and asset_name(asset).endswith(".json.zip")
    ]

    for asset in preferred or fallback:
        url = asset.get("browser_download_url")
        if isinstance(url, str):
            return url

    names = ", ".join(asset_name(asset) for asset in assets)
    raise RuntimeError(f"Could not find an English JMdict JSON zip asset. Assets: {names}")


def asset_name(asset: dict[str, Any]) -> str:
    name = asset.get("name")
    return name if isinstance(name, str) else ""


def iter_jlpt_terms(rows: list[Any], level: str, *, source_offset: int):
    local_index = 0

    for row in rows:
        if not isinstance(row, list) or len(row) < 3:
            continue

        term, meta_type, payload = row[0], row[1], row[2]
        if not isinstance(term, str) or meta_type != "freq" or not isinstance(payload, dict):
            continue

        frequency = payload.get("frequency")
        reading = payload.get("reading")

        if not isinstance(frequency, dict) or frequency.get("displayValue") != level:
            continue

        if not isinstance(reading, str) or not reading:
            continue

        yield SourceTerm(
            source_index=source_offset + local_index,
            level=level,
            term=term,
            reading=reading,
        )
        local_index += 1


def find_dictionary_match(
    dictionary_index: dict[tuple[str | None, str], DictionaryMatch],
    kanji: str | None,
    reading: str,
) -> DictionaryMatch | None:
    exact = dictionary_index.get((kanji, reading))
    if exact is not None:
        return exact

    # If the JLPT source uses kana-only spelling, JMdict may still have the word
    # under one or more kanji spellings. In that case the reading itself is the
    # useful key for KanaKey, and we intentionally keep `kanji` omitted.
    if kanji is None:
        return dictionary_index.get((None, reading))

    # Last-resort fallback for kanji variant mismatches.
    return dictionary_index.get((None, reading))


def build_dictionary_index(jmdict: dict[str, Any]) -> dict[tuple[str | None, str], DictionaryMatch]:
    index: dict[tuple[str | None, str], DictionaryMatch] = {}

    for word in jmdict.get("words", []):
        if not isinstance(word, dict):
            continue

        kanji_entries = word.get("kanji") or []
        kana_entries = word.get("kana") or []
        senses = word.get("sense") or []

        kanji_by_text = {
            entry.get("text"): entry
            for entry in kanji_entries
            if isinstance(entry, dict) and isinstance(entry.get("text"), str)
        }
        kanji_texts = list(kanji_by_text)

        for kana_entry in kana_entries:
            if not isinstance(kana_entry, dict):
                continue

            kana_text = kana_entry.get("text")
            if not isinstance(kana_text, str):
                continue

            candidates = candidate_kanji_spellings(
                kanji_texts,
                kanji_by_text,
                kana_entry.get("appliesToKanji"),
            )
            candidate_matches: list[DictionaryMatch] = []

            for kanji_text in candidates:
                meaning = choose_meaning(senses, kanji_text, kana_text)
                if meaning is None:
                    continue

                match = DictionaryMatch(
                    meaning=meaning,
                    priority_score=priority_score(kanji_by_text.get(kanji_text), kana_entry),
                )
                put_best(index, (kanji_text, kana_text), match)
                candidate_matches.append(match)

            best_match = best_dictionary_match(candidate_matches)
            if best_match is not None:
                put_best(index, (None, kana_text), best_match)

    return index


def candidate_kanji_spellings(
    kanji_texts: list[str],
    kanji_by_text: dict[str, Any],
    applies_to_kanji: Any,
) -> list[str | None]:
    if not kanji_texts:
        return [None]

    if applies_to_kanji == ["*"]:
        return kanji_texts

    # In jmdict-simplified, empty appliesToKanji means this kana spelling
    # applies to no kanji spelling, so it is kana-only for our purposes.
    if applies_to_kanji == []:
        return [None]

    if isinstance(applies_to_kanji, list):
        return [
            item
            for item in applies_to_kanji
            if isinstance(item, str) and item in kanji_by_text
        ]

    return []


def put_best(
    index: dict[tuple[str | None, str], DictionaryMatch],
    key: tuple[str | None, str],
    match: DictionaryMatch,
) -> None:
    existing = index.get(key)
    if existing is None or match.priority_score < existing.priority_score:
        index[key] = match


def best_dictionary_match(matches: list[DictionaryMatch]) -> DictionaryMatch | None:
    if not matches:
        return None
    return min(matches, key=lambda match: match.priority_score)


def priority_score(kanji_entry: Any, kana_entry: Any) -> int:
    tags: list[str] = []
    common = False

    for entry in [kanji_entry, kana_entry]:
        if not isinstance(entry, dict):
            continue

        common = common or entry.get("common") is True

        entry_tags = entry.get("tags")
        if isinstance(entry_tags, list):
            tags.extend(tag for tag in entry_tags if isinstance(tag, str))

    tag_scores = [PRIORITY_TAG_SCORE[tag] for tag in tags if tag in PRIORITY_TAG_SCORE]
    if tag_scores:
        return min(tag_scores)

    if common:
        return 10

    return 100


def choose_meaning(senses: list[Any], kanji: str | None, kana: str) -> str | None:
    for sense in senses:
        if not isinstance(sense, dict):
            continue

        if not applies_to(sense.get("appliesToKanji"), kanji):
            continue

        if not applies_to(sense.get("appliesToKana"), kana):
            continue

        glosses = [
            gloss.get("text")
            for gloss in sense.get("gloss", [])
            if isinstance(gloss, dict)
            and gloss.get("lang") == "eng"
            and isinstance(gloss.get("text"), str)
        ]

        if glosses:
            return ", ".join(glosses[:3])

    return None


def applies_to(applies_to_values: Any, value: str | None) -> bool:
    if applies_to_values == ["*"]:
        return True

    if value is None:
        return False

    return isinstance(applies_to_values, list) and value in applies_to_values

def frequency_score(term: str, reading: str) -> float:
    assert zipf_frequency is not None

    # Numeric/ascii variants like ７日 are noisy for our purposes.
    # Prefer 七日 or another normal written form if it exists.
    if contains_digit_or_ascii(term):
        return -1.0

    # Important:
    # Do NOT compare against `reading` when the source has kanji.
    #
    # 歯【は】 should be scored as 歯, not は,
    # because は is also the topic particle and becomes absurdly frequent.
    #
    # Same for:
    #   二【に】 vs に particle
    #   手【て】 vs て particle
    #   戸【と】 vs と particle
    if is_kana_only(term):
        return zipf_frequency(reading, "ja")

    term_score = zipf_frequency(term, "ja")

    # Reading score is useful for variants like:
    #   私【わたし】 vs 私【わたくし】
    #   何【なに】 vs 何【なん】
    #
    # But one-kana readings are dangerous:
    #   歯【は】 vs は particle
    #   手【て】 vs て particle
    #   二【に】 vs に particle
    if len(reading) >= 2:
        reading_score = zipf_frequency(reading, "ja")
        # Kanji spelling says "this written word is common".
        # Reading spelling says "this pronunciation/reading is common".
        #
        # Use mostly kanji score, but enough reading score to push rare/formal
        # readings like わたくし below normal readings like わたし.
        return term_score * 0.8 + reading_score * 0.2

    return term_score


def imported_entry_sort_key(entry: ImportedEntry):
    return (
        -entry.frequency_score,  # popular first
        entry.level_score,       # N5 before N4 when equal
        entry.priority_score,    # JMdict commonness bucket
        entry.source_index,      # stable final fallback
    )


def script_for(kana: str) -> str | None:
    if HIRAGANA_RE.fullmatch(kana):
        return "hiragana"

    if KATAKANA_RE.fullmatch(kana):
        return "katakana"

    return None


def is_kana_only(value: str) -> bool:
    return all(
        HIRAGANA_RE.fullmatch(char) is not None
        or KATAKANA_RE.fullmatch(char) is not None
        for char in value
    )


def contains_digit_or_ascii(value: str) -> bool:
    return any(char.isascii() for char in value)


def format_compact_json_array(entries: list[dict[str, str]]) -> str:
    if not entries:
        return "[]\n"

    lines = ["["]

    for index, entry in enumerate(entries):
        suffix = "," if index < len(entries) - 1 else ""
        line = json.dumps(entry, ensure_ascii=False, separators=(", ", ": "))
        lines.append(f"  {line}{suffix}")

    lines.append("]")
    return "\n".join(lines) + "\n"


def print_top_frequency_preview(imported: list[ImportedEntry]) -> None:
    top = sorted(imported, key=lambda entry: -entry.frequency_score)[:20]

    print("\nTop 20 by wordfreq:")
    for entry in top:
        word = entry.data.get("kanji") or entry.data["kana"]
        kana = entry.data["kana"]
        level = entry.data["jlpt"]
        freq = entry.frequency_score
        print(f"  {freq:4.2f}  {level}  {word}【{kana}】")


def download_text(url: str) -> str:
    return download_bytes(url).decode("utf-8")


def download_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "KanaKey-importer"})
    with urllib.request.urlopen(request) as response:
        return response.read()


if __name__ == "__main__":
    raise SystemExit(main())
