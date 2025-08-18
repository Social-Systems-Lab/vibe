import nano from "nano";
import { DocRef } from "vibe-core";

type SubscriberCallback = (docRef: DocRef) => void;
type Subscribers = Map<string, SubscriberCallback>; // Map<subscriberId, callback>

export class GlobalFeedService {
    private subscriptions: Map<string, Subscribers> = new Map(); // Map<tpye, Subscribers>
    private couch: nano.ServerScope | null = null;
    private changesFeed: any = null;

    async init(url: string, user: string, pass: string) {
        this.couch = nano(url);
        await this.couch.auth(user, pass);
        const globalDb = this.couch.use("global");

        this.changesFeed = globalDb.changesReader.start({ since: "now", includeDocs: true });
        console.log("Listening for global DB changes...");

        this.changesFeed.on("change", (change: any) => {
            if (change.doc) {
                const doc = change.doc as { ref: DocRef; _id: string };
                const type = doc._id.split("/")[0];
                if (type && doc.ref) {
                    this.publish(type, doc.ref);
                }
            }
        });

        this.changesFeed.on("error", (err: any) => {
            console.error("Error in global DB changes feed:", err);
        });
    }

    subscribe(type: string, subscriberId: string, callback: SubscriberCallback) {
        if (!this.subscriptions.has(type)) {
            this.subscriptions.set(type, new Map());
        }
        this.subscriptions.get(type)!.set(subscriberId, callback);
        console.log(`Subscriber ${subscriberId} subscribed to ${type}`);
    }

    unsubscribe(type: string, subscriberId: string) {
        if (this.subscriptions.has(type)) {
            this.subscriptions.get(type)!.delete(subscriberId);
            console.log(`Subscriber ${subscriberId} unsubscribed from ${type}`);
        }
    }

    publish(type: string, docRef: DocRef) {
        if (this.subscriptions.has(type)) {
            console.log(`Publishing update for type ${type} to ${this.subscriptions.get(type)!.size} subscribers.`);
            this.subscriptions.get(type)!.forEach((callback) => {
                try {
                    callback(docRef);
                } catch (error) {
                    console.error("Error executing subscriber callback:", error);
                }
            });
        }
    }
}
