import "nano";

declare module "nano" {
    interface DocumentScope<D> {
        follow(params: FollowParams): Follow;
    }

    interface FollowParams {
        since?: string;
        include_docs?: boolean;
    }

    interface Follow {
        on(event: "change", listener: (change: Change) => void): this;
        follow(): void;
        stop(): void;
    }

    interface Change {
        seq: number | string;
        id: string;
        changes: { rev: string }[];
        doc?: any;
    }
}
