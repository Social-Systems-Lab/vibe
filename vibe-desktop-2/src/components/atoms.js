import { atom, useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { isMobile as detectIsMobile } from "react-device-detect";

// misc
export const isMobileAtom = atom(detectIsMobile);

// account atoms
export const lastAccountLoggedInNameAtom = atomWithStorage("lastAccountLoggedInName", null);
export const signInStatusAtom = atom("undetermined"); // undetermined, loggingIn, creatingAccount, loggedIn
export const accountsAtom = atom([]);
export const signedInAccountsAtom = atom([]);
export const configAtom = atom(null);

// Browser state
export const tabsAtom = atom([]);
export const activeTabIndexAtom = atom(0);