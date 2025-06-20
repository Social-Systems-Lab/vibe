import { atom } from "jotai";

type User = {
    email: string;
    token: string;
};

export const userAtom = atom<User | null>(null);
