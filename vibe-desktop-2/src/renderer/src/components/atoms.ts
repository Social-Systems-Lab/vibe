import { atom } from 'jotai';

// Account related atoms
export type Account = {
  id: string;
  name: string;
  pictureUrl?: string;
};

export const configAtom = atom<any | null>(null);
export const signInStatusAtom = atom<'notLoggedIn' | 'loggedIn'>('notLoggedIn');
export const signedInAccountsAtom = atom<Account[]>([]);
export const activeAccountAtom = atom<Account | null>(null);

// Browser related atoms
export interface Tab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  screenshot?: string;
  type?: 'home' | 'webview';
  reload?: number;
}

export const tabsAtom = atom<Tab[]>([]);
export const activeTabIndexAtom = atom<number>(0);
export const activeTabAtom = atom<Tab | null>(
  (get) => {
    const tabs = get(tabsAtom);
    const activeIndex = get(activeTabIndexAtom);
    return tabs.length > 0 && activeIndex >= 0 && activeIndex < tabs.length 
      ? tabs[activeIndex] 
      : null;
  }
);

// App permissions related atoms
export type PermissionSetting = 'always' | 'ask' | 'never';

export interface InstalledApp {
  appId: string;
  name: string;
  description: string;
  pictureUrl?: string;
  url: string;
  permissions: Record<string, PermissionSetting>;
  hidden: boolean;
}

export const installedAppsAtom = atom<InstalledApp[]>([]);