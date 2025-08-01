import nano from "nano";
import { DocRef } from "vibe-core";

type SubscriberCallback = (docRef: DocRef) => void;
type Subscribers = Map<string, SubscriberCallback>; // Map<subscriberId, callback>

export class GlobalFeedService {
    private subscriptions: Map<string, Subscribers> = new Map(); // Map<collection, Subscribers>
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
                const collection = doc._id.split("/")[0];
                if (collection && doc.ref) {
                    this.publish(collection, doc.ref);
                }
            }
        });

        this.changesFeed.on("error", (err: any) => {
            console.error("Error in global DB changes feed:", err);
        });
    }

    subscribe(collection: string, subscriberId: string, callback: SubscriberCallback) {
        if (!this.subscriptions.has(collection)) {
            this.subscriptions.set(collection, new Map());
        }
        this.subscriptions.get(collection)!.set(subscriberId, callback);
        console.log(`Subscriber ${subscriberId} subscribed to ${collection}`);
    }

    unsubscribe(collection: string, subscriberId: string) {
        if (this.subscriptions.has(collection)) {
            this.subscriptions.get(collection)!.delete(subscriberId);
            console.log(`Subscriber ${subscriberId} unsubscribed from ${collection}`);
        }
    }

    publish(collection: string, docRef: DocRef) {
        if (this.subscriptions.has(collection)) {
            console.log(`Publishing update for collection ${collection} to ${this.subscriptions.get(collection)!.size} subscribers.`);
            this.subscriptions.get(collection)!.forEach((callback) => {
                try {
                    callback(docRef);
                } catch (error) {
                    console.error("Error executing subscriber callback:", error);
                }
            });
        }
    }
}
