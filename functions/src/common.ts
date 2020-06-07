import {
    IFloor,
    IHouse,
    INetworkObject,
    INpc,
    IObject,
    IPerson,
    IResource, IStockpile, IStockpileTile,
    IWall
} from "persons-game-common/lib/types/GameTypes";
import {
    IHouseDatabase, INetworkObjectBaseDatabase,
    INetworkObjectDatabase,
    INpcDatabase,
    IPersonDatabase,
    IResourceDatabase, IStockpileDatabase, IStockpileTileDatabase
} from "./types/database";
import admin from "firebase-admin";
import {getNetworkObjectCellString, getRelevantNetworkObjectCells} from "./cell";

export const networkObjectDatabaseToClient = (networkObjectDatabase: INetworkObjectDatabase): INetworkObject => ({
    ...networkObjectDatabase,
    lastUpdate: networkObjectDatabase.lastUpdate.toDate().toISOString()
});
export const networkObjectClientToDatabase = (networkObjectClient: INetworkObject): INetworkObjectDatabase => ({
    ...networkObjectClient,
    lastUpdate: admin.firestore.Timestamp.fromMillis(Date.parse(networkObjectClient.lastUpdate)),
    cell: getNetworkObjectCellString(networkObjectClient)
});
export const houseDatabaseToClient = (house: IHouseDatabase): IHouse => ({
    ...house,
    lastUpdate: house.lastUpdate.toDate().toISOString()
});
export const houseClientToDatabase = (house: IHouse): IHouseDatabase => ({
    ...house,
    lastUpdate: admin.firestore.Timestamp.fromMillis(Date.parse(house.lastUpdate)),
    cell: getNetworkObjectCellString(house)
});
export const floorClientToDatabase = (floor: IFloor): INetworkObjectBaseDatabase => ({
    ...floor,
    lastUpdate: admin.firestore.Timestamp.fromMillis(Date.parse(floor.lastUpdate)),
    cell: getNetworkObjectCellString(floor)
});
export const wallClientToDatabase = (wall: IWall): INetworkObjectBaseDatabase => ({
    ...wall,
    lastUpdate: admin.firestore.Timestamp.fromMillis(Date.parse(wall.lastUpdate)),
    cell: getNetworkObjectCellString(wall)
});
export const resourceDatabaseToClient = (resourceDatabase: IResourceDatabase): IResource => ({
    ...resourceDatabase,
    lastUpdate: resourceDatabase.lastUpdate.toDate().toISOString(),
    readyTime: resourceDatabase.readyTime.toDate().toISOString()
});
export const resourceClientToDatabase = (resourceClient: IResource): IResourceDatabase => ({
    ...resourceClient,
    lastUpdate: admin.firestore.Timestamp.fromMillis(Date.parse(resourceClient.lastUpdate)),
    readyTime: admin.firestore.Timestamp.fromMillis(Date.parse(resourceClient.readyTime)),
    cell: getNetworkObjectCellString(resourceClient)
});
export const personDatabaseToClient = (personDatabase: IPersonDatabase): IPerson => ({
    ...personDatabase,
    lastUpdate: personDatabase.lastUpdate.toDate().toISOString(),
    inventory: {
        ...personDatabase.inventory,
        slots: personDatabase.inventory.slots.map(networkObjectDatabaseToClient)
    }
});
export const personClientToDatabase = (personClient: IPerson): Partial<IPersonDatabase> => ({
    ...personClient,
    lastUpdate: admin.firestore.Timestamp.fromMillis(Date.parse(personClient.lastUpdate)),
    inventory: {
        ...personClient.inventory,
        slots: personClient.inventory.slots.map(networkObjectClientToDatabase)
    },
    cell: getNetworkObjectCellString(personClient)
});
export const stockpileDatabaseToClient = (stockpile: IStockpileDatabase): IStockpile => ({
    ...stockpile,
    lastUpdate: stockpile.lastUpdate.toDate().toISOString(),
    inventory: {
        ...stockpile.inventory,
        slots: stockpile.inventory.slots.map(networkObjectDatabaseToClient)
    }
});
export const stockpileClientToDatabase = (stockpile: IStockpile): Partial<IStockpileDatabase> => ({
    ...stockpile,
    lastUpdate: admin.firestore.Timestamp.fromMillis(Date.parse(stockpile.lastUpdate)),
    inventory: {
        ...stockpile.inventory,
        slots: stockpile.inventory.slots.map(networkObjectClientToDatabase)
    },
    cell: getNetworkObjectCellString(stockpile)
});
export const stockpileTileClientToDatabase = (stockpile: IStockpileTile): Partial<IStockpileTileDatabase> => ({
    ...stockpile,
    lastUpdate: admin.firestore.Timestamp.fromMillis(Date.parse(stockpile.lastUpdate)),
    cell: getNetworkObjectCellString(stockpile)
});
export const npcDatabaseToClient = (npcDatabase: INpcDatabase): INpc => ({
    ...npcDatabase,
    lastUpdate: npcDatabase.lastUpdate.toDate().toISOString(),
    readyTime: npcDatabase.readyTime.toDate().toISOString(),
    inventory: {
        ...npcDatabase.inventory,
        slots: npcDatabase.inventory.slots.map(networkObjectDatabaseToClient)
    }
});
export const npcClientToDatabase = (npcClient: INpc): Partial<INpcDatabase> => ({
    ...npcClient,
    lastUpdate: admin.firestore.Timestamp.fromMillis(Date.parse(npcClient.lastUpdate)),
    readyTime: admin.firestore.Timestamp.fromMillis(Date.parse(npcClient.readyTime)),
    inventory: {
        ...npcClient.inventory,
        slots: npcClient.inventory.slots.map(networkObjectClientToDatabase)
    },
    cell: getNetworkObjectCellString(npcClient)
});
/**
 * The distance from the object to the current person.
 * @param currentPersonData The current person that the distance is relative to.
 * @param networkObject The object to compute distance for.
 */
const distanceFromCurrentPerson = (currentPersonData: IPersonDatabase, networkObject: IObject): number => {
    return Math.sqrt((networkObject.x - currentPersonData.x) ** 2 + (networkObject.y - currentPersonData.y) ** 2);
};
/**
 * Sort network objects by distance from player from nearest to farthest.
 */
export const sortNetworkObjectsByDistance = (currentPersonData: IPersonDatabase) => (a: IObject, b: IObject): number => {
    return distanceFromCurrentPerson(currentPersonData, a) - distanceFromCurrentPerson(currentPersonData, b);
};
/**
 * Get all objects near person from a collection
 * @param currentPersonData The current person the collection fetch is relative to.
 * @param collectionName The name of the collection.
 * @param cellsArray If the collection uses cells string array instead of cell string.
 */
export const getSimpleCollection = async <T extends IObject>(currentPersonData: IPersonDatabase, collectionName: string, cellsArray: boolean = false, networkObject: boolean = false): Promise<Array<T>> => {
    const dataArrayToReturnAsJson: T[] = [];

    // list of objects near the person
    let queryNotInInventory: admin.firestore.Query;
    // list of objects in the person's inventory
    let queryIsInInventory: admin.firestore.Query | null = null;
    if (cellsArray) {
        // using cells array, perform a search in an array of cells
        // used for objects that can be in multiple cells like lots. Lots can be larger than cellSize.
        queryNotInInventory = admin.firestore().collection(collectionName)
            .where("cells", "array-contains-any", getRelevantNetworkObjectCells(currentPersonData));
    } else {
        // using cell field, perform a search for a cell field
        // used for objects that are in one cell at a time. The objects are smaller than cellSize.
        queryNotInInventory = admin.firestore().collection(collectionName)
            .where("cell", "in", getRelevantNetworkObjectCells(currentPersonData));
    }
    if (networkObject) {
        queryNotInInventory = queryNotInInventory.where("isInInventory", "==", false);
        queryIsInInventory = admin.firestore().collection(collectionName)
            .where("grabbedByPersonId", "==", currentPersonData ? currentPersonData.id : "");
        queryIsInInventory = queryIsInInventory.where("isInInventory", "==", true);
    }
    const queries: Promise<admin.firestore.QuerySnapshot>[] = [queryNotInInventory.get()];
    if (queryIsInInventory) {
        queries.push(queryIsInInventory.get());
    }
    const querySnapshots = await Promise.all(queries);

    for (const querySnapshot of querySnapshots) {
        for (const documentSnapshot of querySnapshot.docs) {
            const data = documentSnapshot.data() as any;
            const dataToReturnAsJson: T = {
                ...data,
                lastUpdate: data.lastUpdate ?
                    typeof data.lastUpdate === "string" ?
                        data.lastUpdate :
                        data.lastUpdate.toDate().toISOString()
                    : undefined,
                readyTime: data.readyTime ?
                    typeof data.readyTime === "string" ?
                        data.readyTime :
                        data.readyTime.toDate().toISOString()
                    : undefined
            };
            dataArrayToReturnAsJson.push(dataToReturnAsJson);
        }
    }

    // get sorted list of nearest cars
    dataArrayToReturnAsJson.sort(sortNetworkObjectsByDistance(currentPersonData));

    return dataArrayToReturnAsJson;
};