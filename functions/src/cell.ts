import {IObject} from "./types/GameTypes";
import {INetworkObjectCellPosition, INetworkObjectDatabase} from "./types/database";
import * as admin from "firebase-admin";
import {cellSize} from "./config";

/**
 * Cells are invisible lines that divide the world space into squares. Each cell is used to quickly filter objects that
 * are near the player. Each cell is represented by a string. The string can be filtered with a '==' or 'in' where
 * clause.
 */

/**
 * Get the cell tile position of a network object.
 * @param networkObject The object to compute position for.
 */
const getNetworkObjectWorldCellPosition = (networkObject: IObject): INetworkObjectCellPosition => {
    const x = Math.round(networkObject.x / cellSize);
    const y = Math.round(networkObject.y / cellSize);
    return {
        x,
        y
    };
};
/**
 * Get the cell string of a cell position.
 * @param position The cell position to convert into a string.
 */
const networkObjectCellPositionToCellString = (position: INetworkObjectCellPosition): string => {
    return `cell:${position.x},${position.y}`;
};
/**
 * Get the cell string of a network object.
 * @param networkObject The network object to convert into a cell string.
 */
export const getNetworkObjectCellString = (networkObject: IObject): string => {
    return networkObjectCellPositionToCellString(getNetworkObjectWorldCellPosition(networkObject));
};
/**
 * Get a list of relevant world cells to filter by.
 * @param networkObject The network object to filter by.
 */
export const getRelevantNetworkObjectCells = (networkObject: IObject): string[] => {
    // gt network object world cell position
    const {x, y} = getNetworkObjectWorldCellPosition(networkObject);

    // which corner of the cell is the object nearest to
    const left = networkObject.x <= x * cellSize;
    const top = networkObject.y <= y * cellSize;

    // pick the current cell and the 3 other cells around the nearest corner, return 4 cells
    return [{
        x,
        y
    }, {
        x: left ? x - 1 : x + 1,
        y
    }, {
        x: left ? x - 1 : x + 1,
        y: top ? y - 1 : y + 1
    }, {
        x,
        y: top ? y - 1 : y + 1
    }].map(networkObjectCellPositionToCellString);
};
/**
 * Add cell string to blank cell objects.
 * @param collectionName The collection to process.
 */
export const addCellStringToBlankCellObjects = async (collectionName: string) => {
    const collectionQuery = await admin.firestore().collection(collectionName).get();
    for (const doc of collectionQuery.docs) {
        const data = doc.data() as INetworkObjectDatabase;

        // if object does not have a cell string
        if (!data.cell) {
            // add cell string to object
            const newData: Partial<INetworkObjectDatabase> = {
                cell: getNetworkObjectCellString(data)
            };
            await doc.ref.set(newData, {merge: true});
        }
    }
};