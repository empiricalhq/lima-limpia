export const theme = {
  colors: {
    backgroundPrimary: '#F7F7F7',
    backgroundSecondary: '#EFEFF4',
    backgroundTertiary: '#E5E5EA',
    backgroundDark: '#1C1C1E',
    textPrimary: '#1C1C1E',
    textSecondary: '#8A8A8E',
    textTertiary: '#AEAEB2',
    textOnDark: '#FFFFFF',
    accentIncome: '#76FBB1',
    accentError: '#E34D63',
    accentBudgetRed: '#D46D7F',
    iconLight: '#FFFFFF',
    iconDark: '#1C1C1E',
    iconGrey: '#AEAEB2',
    borderOutline: '#D1D1D6',
  },

  spacing: {
    'spacing-xxs': 2,
    'spacing-xs': 4,
    'spacing-s': 8,
    'spacing-m': 12,
    'spacing-l': 15,
    'spacing-xl': 20,
    'spacing-xxl': 30,
  },

  radius: {
    'radius-xs': 6,
    'radius-s': 9,
    'radius-m': 12,
    'radius-l': 13,
    'radius-xl': 20,
    'radius-full': 9999,
  },

  sizing: {
    'sizing-button-sm': 33,
    'sizing-button-md': 38,
    'sizing-button-lg': 45,
    'sizing-tabbar': 68,
  },

  typography: {
    display: {
      fontFamily: 'Inter-Regular',
      fontSize: 50,
      fontWeight: '400',
    },
    title1: {
      fontFamily: 'Inter-Semibold',
      fontSize: 28,
      fontWeight: '700',
    },
    title2: {
      fontFamily: 'Inter-Semibold',
      fontSize: 22,
      fontWeight: '700',
    },
    title3: {
      fontFamily: 'Inter-Semibold',
      fontSize: 20,
      fontWeight: '700',
    },
    headline: {
      fontFamily: 'Inter-Semibold',
      fontSize: 17,
      fontWeight: '700',
    },
    body: {
      fontFamily: 'Inter-Medium',
      fontSize: 17,
      fontWeight: '500',
    },
    callout: {
      fontFamily: 'Inter-Medium',
      fontSize: 16,
      fontWeight: '500',
    },
    subhead: {
      fontFamily: 'Inter-Semibold',
      fontSize: 15,
      fontWeight: '600',
    },
    footnote: {
      fontFamily: 'Inter-Medium',
      fontSize: 13,
      fontWeight: '500',
    },
    caption: {
      fontFamily: 'Inter-Semibold',
      fontSize: 12,
      fontWeight: '600',
    },
    caption2: {
      fontFamily: 'Inter-Medium',
      fontSize: 11,
      fontWeight: '500',
    },
  },

  shadow: {
    'shadow-soft': {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 5,
      elevation: 3,
    },
    'shadow-strong': {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 30,
      elevation: 10,
    },
  },

  animation: {
    spring: {
      damping: 15,
      stiffness: 120,
    },
    duration: {
      short: 150,
      medium: 300,
      long: 500,
    },
  },
} as const;
