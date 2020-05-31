import {IObjectHealth} from "persons-game-common/lib/types/GameTypes";
import * as admin from "firebase-admin";
import {INetworkObjectDatabase} from "./types/database";

/**
 * Handle all health related status.
 */

/**
 * Perform health updates on a database collection of [[INetworkObject]] objects.
 * @param collectionName The name of the collection to update.
 * @param defaultHealthObject The default health object of the collection.
 */
export const performHealthTickOnCollectionOfNetworkObjects = async (collectionName: string, defaultHealthObject: IObjectHealth) => {
    const collectionQuery = await admin.firestore().collection(collectionName).get();
    for (const doc of collectionQuery.docs) {
        const data = doc.data() as INetworkObjectDatabase;
        // use existing or default health object
        const healthData: IObjectHealth = data.health || defaultHealthObject;
        // compute new health value
        const newValue = Math.max(0, Math.min(healthData.value + healthData.rate, healthData.max));

        // if health object does not exist, or health value changed, or object is dead, update health object
        if (!data.health || newValue !== healthData.value || newValue === 0) {
            if (newValue === 0) {
                // 0 health, death of person or destruction of object
                await doc.ref.delete();
            } else {
                // change person or object health
                const newData: Partial<INetworkObjectDatabase> = {
                    health: {
                        ...healthData,
                        value: newValue
                    }
                };
                await doc.ref.set(newData, {merge: true});
            }
        }
    }
};