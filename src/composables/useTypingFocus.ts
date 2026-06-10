import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

export function useTypingFocus() {
  const typingBox = ref<HTMLInputElement | null>(null)

  onMounted(() => {
    focusTypingBox()
    document.addEventListener('visibilitychange', focusTypingBoxWhenVisible)
    window.addEventListener('focus', focusTypingBox)
    window.addEventListener('pageshow', focusTypingBox)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', focusTypingBoxWhenVisible)
    window.removeEventListener('focus', focusTypingBox)
    window.removeEventListener('pageshow', focusTypingBox)
  })

  function focusTypingBox() {
    nextTick(() => typingBox.value?.focus())
  }

  function focusTypingBoxWhenVisible() {
    if (!document.hidden) focusTypingBox()
  }

  return {
    focusTypingBox,
    typingBox,
  }
}
