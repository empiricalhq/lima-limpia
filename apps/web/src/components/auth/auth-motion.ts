const ANIMATION_DURATION_IN = 0.3;
const ANIMATION_DURATION_OUT = 0.2;
// biome-ignore lint/style/noMagicNumbers: standard easing curve.
const EASE_OUT_QUAD: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];
// biome-ignore lint/style/noMagicNumbers: standard easing curve.
const EASE_IN_QUAD: [number, number, number, number] = [0.55, 0.085, 0.68, 0.53];

/** Entry and exit transition for the panels an auth flow swaps between. */
export const contentVariants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: ANIMATION_DURATION_IN, ease: EASE_OUT_QUAD },
  },
  exit: {
    opacity: 0,
    transition: { duration: ANIMATION_DURATION_OUT, ease: EASE_IN_QUAD },
  },
};
