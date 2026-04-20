/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*.scss' {
  const css: string;
  export default css;
}

declare module '*.module.scss' {
  const classes: Record<string, string>;
  export default classes;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface Navigator {
  standalone?: boolean;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
}
