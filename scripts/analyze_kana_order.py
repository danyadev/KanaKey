#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

Script = Literal['hiragana', 'katakana']

ROOT = Path(__file__).resolve().parents[1]
KANA_TS = ROOT / 'src' / 'model' / 'kana.ts'
WORDS_JSON = ROOT / 'src' / 'words.json'

DEFAULT_MIN_ELIGIBLE = 20
DEFAULT_INITIAL = 5
DEFAULT_BEAM = 500
DEFAULT_MAX_SCAN = 40
DEFAULT_REPORT_LIMIT = 35


@dataclass(frozen=True)
class RawWord:
    index: int
    kana: str
    script: Script


@dataclass(frozen=True)
class Word:
    index: int
    kana: str
    mask: int
    unit_bits: frozenset[int]
    weight: float


@dataclass(frozen=True)
class CandidateState:
    order: tuple[int, ...]
    mask: int
    score: tuple[float, ...]


class WordAnalyzer:
    def __init__(self, words: list[Word]) -> None:
        self.words = words
        self._eligible_count_cache: dict[tuple[int, int], int] = {}
        self._eligible_words_cache: dict[tuple[int, int], list[Word]] = {}
        self._unlocked_score_cache: dict[int, float] = {}

    def eligible_count_for_target(self, mask: int, target_bit: int) -> int:
        key = (mask, target_bit)
        cached = self._eligible_count_cache.get(key)
        if cached is not None:
            return cached

        count = 0
        target_mask = 1 << target_bit

        for word in self.words:
            if word.mask & ~mask == 0 and word.mask & target_mask:
                count += 1

        self._eligible_count_cache[key] = count
        return count

    def eligible_words_for_target(self, mask: int, target_bit: int) -> list[Word]:
        key = (mask, target_bit)
        cached = self._eligible_words_cache.get(key)
        if cached is not None:
            return cached

        result: list[Word] = []
        target_mask = 1 << target_bit

        for word in self.words:
            if word.mask & ~mask == 0 and word.mask & target_mask:
                result.append(word)

        self._eligible_words_cache[key] = result
        return result

    def unlocked_word_score(self, mask: int) -> float:
        cached = self._unlocked_score_cache.get(mask)
        if cached is not None:
            return cached

        score = sum(
            word.weight
            for word in self.words
            if word.mask & ~mask == 0
        )

        self._unlocked_score_cache[mask] = score
        return score


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--script', choices=['hiragana', 'katakana', 'both'], default='both')
    parser.add_argument('--min', type=int, default=DEFAULT_MIN_ELIGIBLE)
    parser.add_argument('--initial', type=int, default=DEFAULT_INITIAL)
    parser.add_argument('--beam', type=int, default=DEFAULT_BEAM)
    parser.add_argument('--max-scan', type=int, default=DEFAULT_MAX_SCAN)
    parser.add_argument('--limit', type=int, default=DEFAULT_REPORT_LIMIT)
    parser.add_argument('--sample', type=int, default=0)
    parser.add_argument('--fail-on-missing', action='store_true')
    args = parser.parse_args()

    source = KANA_TS.read_text(encoding='utf-8')
    raw_words = load_words(WORDS_JSON)

    scripts: list[Script] = (
        ['hiragana', 'katakana']
        if args.script == 'both'
        else [args.script]
    )

    for script in scripts:
        current_order = read_order(source, script)
        script_words = [
            word
            for word in raw_words
            if word.script == script
        ]

        print()
        print('=' * 20)
        print(script.upper())
        print('=' * 20)

        missing = find_missing_from_order(current_order, script_words)
        unused = find_unused_in_words(current_order, script_words)

        print_validation_report(missing, unused)

        if args.fail_on_missing and missing:
            raise SystemExit(
                f'{script} order is missing kana used by words.json: {" ".join(missing)}',
            )

        kana_units = current_order + [
            kana
            for kana in missing
            if kana not in current_order
        ]

        kana_to_bit = {
            kana: index
            for index, kana in enumerate(kana_units)
        }

        words = build_words(script_words, kana_to_bit)
        analyzer = WordAnalyzer(words)

        original_rank = {
            kana: index
            for index, kana in enumerate(current_order)
        }

        print()
        print('Current initial prefix:', ' '.join(current_order[:args.initial]))
        print_progression_report(
            title='Current order report',
            order=current_order,
            analyzer=analyzer,
            kana_to_bit=kana_to_bit,
            min_eligible=args.min,
            initial=args.initial,
            limit=args.limit,
            sample=args.sample,
        )

        initial_order = find_best_initial_prefix(
            kana_units=kana_units,
            analyzer=analyzer,
            original_rank=original_rank,
            size=args.initial,
            min_eligible=args.min,
            beam_width=args.beam,
        )

        suggested_order = extend_greedy(
            start=initial_order,
            kana_units=kana_units,
            analyzer=analyzer,
            original_rank=original_rank,
            min_eligible=args.min,
        )

        print()
        print('Suggested order:')
        print_ts_array(
            'HIRAGANA_ORDER' if script == 'hiragana' else 'KATAKANA_ORDER',
            suggested_order,
        )

        print_progression_report(
            title='Suggested order report',
            order=suggested_order,
            analyzer=analyzer,
            kana_to_bit=kana_to_bit,
            min_eligible=args.min,
            initial=args.initial,
            limit=args.limit,
            sample=args.sample,
        )

        print_initial_scan(
            title='Suggested order initial-size scan',
            order=suggested_order,
            analyzer=analyzer,
            kana_to_bit=kana_to_bit,
            min_eligible=args.min,
            min_size=args.initial,
            max_size=args.max_scan,
        )

    return 0


def load_words(path: Path) -> list[RawWord]:
    payload = json.loads(path.read_text(encoding='utf-8'))
    result: list[RawWord] = []

    for index, entry in enumerate(payload):
        kana = read_kana(entry)
        if not kana:
            continue

        kana = unicodedata.normalize('NFC', kana)
        script = read_script(entry, kana)

        if script is None:
            continue

        result.append(
            RawWord(
                index=index,
                kana=kana,
                script=script,
            ),
        )

    return result


def read_kana(entry) -> str | None:
    if isinstance(entry, str):
        return entry

    if not isinstance(entry, dict):
        return None

    value = (
        entry.get('kana')
        or entry.get('reading')
        or entry.get('surface')
        or entry.get('word')
    )

    return value if isinstance(value, str) else None


def read_script(entry, kana: str) -> Script | None:
    if isinstance(entry, dict):
        script = entry.get('script')
        if script == 'hiragana' or script == 'katakana':
            return script

    return infer_script(kana)


def infer_script(kana: str) -> Script | None:
    units = split_units(kana)

    has_hiragana = any(is_hiragana_unit(unit) for unit in units)
    has_katakana = any(is_katakana_unit(unit) for unit in units)

    if has_hiragana and not has_katakana:
        return 'hiragana'

    if has_katakana and not has_hiragana:
        return 'katakana'

    return None


def read_order(source: str, script: Script) -> list[str]:
    const_name = 'HIRAGANA_ORDER' if script == 'hiragana' else 'KATAKANA_ORDER'
    match = re.search(
        rf'export const {const_name} = \[(.*?)\] as const',
        source,
        re.DOTALL,
    )

    if not match:
        raise RuntimeError(f'Cannot find {const_name}')

    return re.findall(r'["\']([^"\']+)["\']', match.group(1))


def split_units(value: str) -> list[str]:
    return [
        char
        for char in unicodedata.normalize('NFC', value)
        if char.strip()
    ]


def is_hiragana_unit(value: str) -> bool:
    return '\u3041' <= value <= '\u3096'


def is_katakana_unit(value: str) -> bool:
    return value == 'ー' or '\u30a1' <= value <= '\u30fa'


def find_missing_from_order(current_order: list[str], words: list[RawWord]) -> list[str]:
    ordered_units: list[str] = []
    seen: set[str] = set()

    for word in words:
        for unit in split_units(word.kana):
            if unit not in seen:
                seen.add(unit)
                ordered_units.append(unit)

    return [
        unit
        for unit in ordered_units
        if unit not in current_order
    ]


def find_unused_in_words(current_order: list[str], words: list[RawWord]) -> list[str]:
    used = {
        unit
        for word in words
        for unit in split_units(word.kana)
    }

    return [
        kana
        for kana in current_order
        if kana not in used
    ]


def print_validation_report(missing: list[str], unused: list[str]) -> None:
    print('Validation:')
    print('  Missing from order:', ' '.join(missing) if missing else '-')
    print('  In order but unused:', ' '.join(unused) if unused else '-')


def build_words(raw_words: list[RawWord], kana_to_bit: dict[str, int]) -> list[Word]:
    words: list[Word] = []

    for rank, raw_word in enumerate(raw_words):
        unit_bits = frozenset(
            kana_to_bit[unit]
            for unit in split_units(raw_word.kana)
        )

        mask = 0
        for bit in unit_bits:
            mask |= 1 << bit

        # words.json is assumed to be ranked/usefulness-sorted.
        # Earlier words should matter more than late words.
        weight = 1.0 / ((rank + 1) ** 0.65)

        words.append(
            Word(
                index=raw_word.index,
                kana=raw_word.kana,
                mask=mask,
                unit_bits=unit_bits,
                weight=weight,
            ),
        )

    return words


def find_best_initial_prefix(
    *,
    kana_units: list[str],
    analyzer: WordAnalyzer,
    original_rank: dict[str, int],
    size: int,
    min_eligible: int,
    beam_width: int,
) -> list[str]:
    states = [
        CandidateState(
            order=(),
            mask=0,
            score=(0,),
        ),
    ]

    for depth in range(size):
        next_by_mask: dict[int, CandidateState] = {}

        for state in states:
            used = set(state.order)

            for bit in range(len(kana_units)):
                if bit in used:
                    continue

                order = (*state.order, bit)
                mask = state.mask | (1 << bit)
                score = score_initial_prefix(
                    order=order,
                    mask=mask,
                    kana_units=kana_units,
                    analyzer=analyzer,
                    original_rank=original_rank,
                    min_eligible=min_eligible,
                )

                candidate = CandidateState(
                    order=order,
                    mask=mask,
                    score=score,
                )

                previous = next_by_mask.get(mask)
                if previous is None or candidate.score > previous.score:
                    next_by_mask[mask] = candidate

        states = sorted(
            next_by_mask.values(),
            key=lambda state: state.score,
            reverse=True,
        )[:beam_width]

        print(
            f'Initial search depth {depth + 1}/{size}: '
            f'kept {len(states)} states, best={format_score(states[0].score)}',
        )

    best = max(states, key=lambda state: state.score)
    sorted_bits = sort_initial_bits(
        bits=best.order,
        mask=best.mask,
        kana_units=kana_units,
        analyzer=analyzer,
        original_rank=original_rank,
    )

    return [
        kana_units[bit]
        for bit in sorted_bits
    ]


def score_initial_prefix(
    *,
    order: tuple[int, ...],
    mask: int,
    kana_units: list[str],
    analyzer: WordAnalyzer,
    original_rank: dict[str, int],
    min_eligible: int,
) -> tuple[float, ...]:
    counts = [
        analyzer.eligible_count_for_target(mask, bit)
        for bit in order
    ]

    if not counts:
        return (0,)

    min_count = min(counts)
    ok_count = sum(1 for count in counts if count >= min_eligible)
    capped_sum = sum(min(count, min_eligible) for count in counts)
    raw_sum = sum(counts)
    unlocked_score = analyzer.unlocked_word_score(mask)

    rank_penalty = sum(
        original_rank.get(kana_units[bit], 999)
        for bit in order
    )

    return (
        min(min_count, min_eligible),
        min_count,
        ok_count,
        capped_sum,
        raw_sum,
        unlocked_score,
        -rank_penalty,
    )


def sort_initial_bits(
    *,
    bits: tuple[int, ...],
    mask: int,
    kana_units: list[str],
    analyzer: WordAnalyzer,
    original_rank: dict[str, int],
) -> list[int]:
    return sorted(
        bits,
        key=lambda bit: (
            -analyzer.eligible_count_for_target(mask, bit),
            original_rank.get(kana_units[bit], 999),
            kana_units[bit],
        ),
    )


def extend_greedy(
    *,
    start: list[str],
    kana_units: list[str],
    analyzer: WordAnalyzer,
    original_rank: dict[str, int],
    min_eligible: int,
) -> list[str]:
    order = list(start)
    used = set(order)
    mask = mask_for(order, {
        kana: bit
        for bit, kana in enumerate(kana_units)
    })

    while len(order) < len(kana_units):
        best_kana: str | None = None
        best_score: tuple[float, ...] | None = None

        for bit, kana in enumerate(kana_units):
            if kana in used:
                continue

            next_mask = mask | (1 << bit)
            target_count = analyzer.eligible_count_for_target(next_mask, bit)
            unlocked_score = analyzer.unlocked_word_score(next_mask)
            starved_improvement = count_starvation_improvement(
                analyzer=analyzer,
                previous_mask=mask,
                next_mask=next_mask,
                target_kana=order,
                kana_units=kana_units,
                min_eligible=min_eligible,
            )

            # Hard priority:
            # 1. maximize words for the next required target kana
            # 2. then generally useful unlocked words
            # 3. then help previously starved targets
            # 4. then preserve old order as a weak tie-breaker
            score = (
                min(target_count, min_eligible),
                target_count,
                unlocked_score,
                starved_improvement,
                -original_rank.get(kana, 999),
            )

            if best_score is None or score > best_score:
                best_score = score
                best_kana = kana

        assert best_kana is not None

        order.append(best_kana)
        used.add(best_kana)
        mask |= 1 << kana_units.index(best_kana)

    return order


def count_starvation_improvement(
    *,
    analyzer: WordAnalyzer,
    previous_mask: int,
    next_mask: int,
    target_kana: list[str],
    kana_units: list[str],
    min_eligible: int,
) -> int:
    improvement = 0

    for kana in target_kana:
        bit = kana_units.index(kana)

        before = analyzer.eligible_count_for_target(previous_mask, bit)
        after = analyzer.eligible_count_for_target(next_mask, bit)

        improvement += max(0, min_eligible - before)
        improvement -= max(0, min_eligible - after)

    return improvement


def mask_for(kana_list: list[str], kana_to_bit: dict[str, int]) -> int:
    mask = 0

    for kana in kana_list:
        mask |= 1 << kana_to_bit[kana]

    return mask


def print_progression_report(
    *,
    title: str,
    order: list[str],
    analyzer: WordAnalyzer,
    kana_to_bit: dict[str, int],
    min_eligible: int,
    initial: int,
    limit: int,
    sample: int,
) -> None:
    print()
    print(title)
    print('step  kana  eligible  status')
    print('----  ----  --------  ------')

    shown = min(limit, len(order))

    for index, kana in enumerate(order[:shown], start=1):
        prefix = order[:max(initial, index)]
        mask = mask_for(prefix, kana_to_bit)
        bit = kana_to_bit[kana]
        count = analyzer.eligible_count_for_target(mask, bit)
        status = 'ok' if count >= min_eligible else 'LOW'

        line = f'{index:>4}  {kana:<4}  {count:>8}  {status}'

        if sample > 0:
            samples = analyzer.eligible_words_for_target(mask, bit)[:sample]
            sample_text = ', '.join(word.kana for word in samples)
            line += f'  {sample_text}'

        print(line)

    low = find_low_targets(
        order=order,
        analyzer=analyzer,
        kana_to_bit=kana_to_bit,
        min_eligible=min_eligible,
        initial=initial,
    )

    if low:
        print()
        print(f'Low targets under {min_eligible}:')
        for index, kana, count in low[:40]:
            print(f'  {index:>3}. {kana}: {count}')


def find_low_targets(
    *,
    order: list[str],
    analyzer: WordAnalyzer,
    kana_to_bit: dict[str, int],
    min_eligible: int,
    initial: int,
) -> list[tuple[int, str, int]]:
    low: list[tuple[int, str, int]] = []

    for index, kana in enumerate(order, start=1):
        prefix = order[:max(initial, index)]
        mask = mask_for(prefix, kana_to_bit)
        bit = kana_to_bit[kana]
        count = analyzer.eligible_count_for_target(mask, bit)

        if count < min_eligible:
            low.append((index, kana, count))

    return low


def print_initial_scan(
    *,
    title: str,
    order: list[str],
    analyzer: WordAnalyzer,
    kana_to_bit: dict[str, int],
    min_eligible: int,
    min_size: int,
    max_size: int,
) -> None:
    print()
    print(title)
    print('size  min  avg    ok/total  worst')
    print('----  ---  -----  --------  -----')

    max_size = min(max_size, len(order))

    for size in range(min_size, max_size + 1):
        prefix = order[:size]
        mask = mask_for(prefix, kana_to_bit)

        counts = [
            (
                kana,
                analyzer.eligible_count_for_target(mask, kana_to_bit[kana]),
            )
            for kana in prefix
        ]

        min_count = min(count for _, count in counts)
        avg_count = sum(count for _, count in counts) / len(counts)
        ok_count = sum(1 for _, count in counts if count >= min_eligible)

        worst = ' '.join(
            f'{kana}:{count}'
            for kana, count in sorted(counts, key=lambda item: item[1])[:5]
        )

        print(
            f'{size:>4}  {min_count:>3}  {avg_count:>5.1f}  '
            f'{ok_count:>2}/{len(counts):<5}  {worst}',
        )


def print_ts_array(name: str, order: list[str]) -> None:
    print(f'export const {name} = [')
    for index in range(0, len(order), 12):
        chunk = order[index:index + 12]
        values = ', '.join(repr(kana) for kana in chunk)
        print(f'  {values},')
    print('] as const')


def format_score(score: tuple[float, ...]) -> str:
    return '(' + ', '.join(format_score_value(value) for value in score) + ')'


def format_score_value(value: float) -> str:
    if isinstance(value, int):
        return str(value)

    if value.is_integer():
        return str(int(value))

    return f'{value:.2f}'


if __name__ == '__main__':
    raise SystemExit(main())
