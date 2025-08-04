export type FileItem = {
    id: string;
    name?: string;
    storageKey?: string;
    url?: string;
    thumbnailUrl?: string;
    mimeType?: string;
    size?: number;
    createdAt?: string | number | Date;
    acl?: any;
};

export type SelectionMode = "single" | "multiple";
