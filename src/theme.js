export const COLOR_KEY = "duovoice.color";
export const THEME_KEY = "duovoice.themePlus";

export const PALETTE = {
  violet: "#a78bfa",
  rose: "#f472b6",
  bleu: "#60a5fa",
  vert: "#4ade80",
  jaune: "#facc15",
  orange: "#fb923c",
  cyan: "#22d3ee",
  ardoise: "#94a3b8"
};

export const THEMES = {
  duovoice: {
    label: "DuoVoice",
    description: "Sombre neutre avec votre couleur d’accent.",
    preview: ["#0d0f13", "#15181e", "#a78bfa"],
    vars: {
      "--bg": "#0d0f13", "--panel": "#15181e", "--panel-soft": "#101319",
      "--surface": "#1c2028", "--surface-hover": "#232833", "--border": "#272d37",
      "--border-strong": "#303641", "--text": "#f4f6f8", "--muted": "#7f8794",
      "--success": "#78cc9d", "--success-soft": "#102e20", "--success-border": "#1f6c47",
      "--danger": "#e77984", "--danger-soft": "#3a1d24", "--danger-border": "#71343f", "--danger-text": "#f09aa3",
      "--update": "#c084fc", "--update-alt": "#f472b6", "--on-accent": "#ffffff",
      "--shadow": "#00000033", "--overlay": "#00000099"
    }
  },
  windowsxp: {
    label: "Windows XP",
    description: "Bleu classique, surfaces crème et accent vert.",
    preview: ["#ece9d8", "#ffffff", "#316ac5", "#5cab3c"],
    vars: {
      "--bg": "#ece9d8", "--panel": "#f8f7ef", "--panel-soft": "#ffffff",
      "--surface": "#f1efe3", "--surface-hover": "#dfe9fb", "--border": "#9a9a86",
      "--border-strong": "#7f9db9", "--text": "#20242b", "--muted": "#66707a",
      "--accent": "#316ac5", "--accent-soft": "#316ac51c", "--accent-border": "#316ac570", "--accent-focus": "#316ac52a",
      "--success": "#4f9d3a", "--success-soft": "#e4f2df", "--success-border": "#7db868",
      "--danger": "#c84b45", "--danger-soft": "#f8e3e1", "--danger-border": "#dc8e89", "--danger-text": "#a93834",
      "--update": "#6f61c9", "--update-alt": "#c56ca5", "--on-accent": "#ffffff",
      "--shadow": "#50607026", "--overlay": "#18233066"
    }
  },
  axolotl: {
    label: "Axolotl",
    description: "Rose mauve doux sur fond sombre chaleureux.",
    preview: ["#241b29", "#35243b", "#ff8fcf"],
    vars: {
      "--bg": "#241b29", "--panel": "#332338", "--panel-soft": "#2a1f30",
      "--surface": "#432d49", "--surface-hover": "#56375d", "--border": "#63436b",
      "--border-strong": "#7a5383", "--text": "#fff4fb", "--muted": "#c9abc1",
      "--accent": "#ff8fcf", "--accent-soft": "#ff8fcf22", "--accent-border": "#ff8fcf70", "--accent-focus": "#ff8fcf2e",
      "--success": "#7fd2a3", "--success-soft": "#183b2a", "--success-border": "#3e805b",
      "--danger": "#f17f91", "--danger-soft": "#4a2530", "--danger-border": "#8a4657", "--danger-text": "#ffb5c0",
      "--update": "#c99bff", "--update-alt": "#ff91cf", "--on-accent": "#2e1626",
      "--shadow": "#10091255", "--overlay": "#140c1899"
    }
  },
  cherry: {
    label: "Cherry Blossom",
    description: "Rose très clair, blanc cassé et cerisier doux.",
    preview: ["#fff3f6", "#fffafb", "#e884a2"],
    vars: {
      "--bg": "#fff3f6", "--panel": "#fffafb", "--panel-soft": "#ffeef3",
      "--surface": "#ffffff", "--surface-hover": "#ffe4ec", "--border": "#efc8d4",
      "--border-strong": "#dda3b4", "--text": "#4d3039", "--muted": "#8d6974",
      "--accent": "#e884a2", "--accent-soft": "#e884a220", "--accent-border": "#e884a26b", "--accent-focus": "#e884a22d",
      "--success": "#568b6e", "--success-soft": "#e8f3ec", "--success-border": "#9bc2aa",
      "--danger": "#c95769", "--danger-soft": "#fae7eb", "--danger-border": "#e6a7b2", "--danger-text": "#a63e50",
      "--update": "#a96fc2", "--update-alt": "#e884a2", "--on-accent": "#ffffff",
      "--shadow": "#7d4a5b22", "--overlay": "#57354055"
    }
  },
  sage: {
    label: "Sage",
    description: "Vert pâle, sobre et légèrement désaturé.",
    preview: ["#111813", "#18221b", "#98b99f"],
    vars: {
      "--bg": "#111813", "--panel": "#18221b", "--panel-soft": "#131b16",
      "--surface": "#1f2c23", "--surface-hover": "#29382d", "--border": "#324638",
      "--border-strong": "#48604f", "--text": "#eff5ef", "--muted": "#99aa9d",
      "--accent": "#98b99f", "--accent-soft": "#98b99f20", "--accent-border": "#98b99f68", "--accent-focus": "#98b99f2d",
      "--success": "#82c89a", "--success-soft": "#183223", "--success-border": "#3f7552",
      "--danger": "#d98282", "--danger-soft": "#3d2425", "--danger-border": "#754343", "--danger-text": "#efabab",
      "--update": "#b9a7d6", "--update-alt": "#d5a5bd", "--on-accent": "#172019",
      "--shadow": "#050b0755", "--overlay": "#07100999"
    }
  },
  ocean: {
    label: "Ocean",
    description: "Bleu profond et cyan calme.",
    preview: ["#0b141b", "#101e28", "#55b8d7"],
    vars: {
      "--bg": "#0b141b", "--panel": "#101e28", "--panel-soft": "#0d1820",
      "--surface": "#162833", "--surface-hover": "#1d3542", "--border": "#294354",
      "--border-strong": "#3a6177", "--text": "#eef8fb", "--muted": "#89a6b5",
      "--accent": "#55b8d7", "--accent-soft": "#55b8d720", "--accent-border": "#55b8d76b", "--accent-focus": "#55b8d72d",
      "--success": "#66c7a4", "--success-soft": "#12362d", "--success-border": "#2f7b67",
      "--danger": "#e47c86", "--danger-soft": "#3e2228", "--danger-border": "#77404a", "--danger-text": "#f0a7ae",
      "--update": "#9a8ee8", "--update-alt": "#60c5d8", "--on-accent": "#081319",
      "--shadow": "#03090d66", "--overlay": "#04101799"
    }
  }
};

export function normalizeThemeName(name) {
  return Object.prototype.hasOwnProperty.call(THEMES, name) ? name : "duovoice";
}

export function applyThemeVariables(root, themeName, accentName = "violet") {
  const normalized = normalizeThemeName(themeName);
  const theme = THEMES[normalized];
  root.dataset.theme = normalized;
  for (const [key, value] of Object.entries(theme.vars)) root.style.setProperty(key, value);

  if (normalized === "duovoice") {
    const accent = PALETTE[accentName] || PALETTE.violet;
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-soft", `${accent}22`);
    root.style.setProperty("--accent-border", `${accent}70`);
    root.style.setProperty("--accent-focus", `${accent}2e`);
  }
  return normalized;
}
