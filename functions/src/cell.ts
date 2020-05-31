import {ILot, IObject} from "persons-game-common/lib/types/GameTypes";
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
    const x = Math.floor(networkObject.x / cellSize);
    const y = Math.floor(networkObject.y / cellSize);
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
 * Compute the cells string of the cells that the lot is in.
 * @param lot The lot to compute multiple cells for.
 */
export const getLotCellsString = (lot: ILot): string[] => {
    // get two corners of the outer edge of the rectangle
    const topLeftCorner = getNetworkObjectWorldCellPosition({
        x: lot.x,
        y: lot.y
    });
    const bottomRightCorner = getNetworkObjectWorldCellPosition({
        x: lot.x + lot.width,
        y: lot.y + lot.height
    });

    // get difference in cells between two corners
    const deltaX = bottomRightCorner.x - topLeftCorner.x;
    const deltaY = bottomRightCorner.y - topLeftCorner.y;

    // for each x and y difference in cells
    const cells: string[] = [];
    // for each column cell
    for (let i = 0; i <= deltaX; i++) {
        // for each row cell
        for (let j = 0; j <= deltaY; j++) {
            // compute cell string from cell position
            cells.push(networkObjectCellPositionToCellString({
                x: topLeftCorner.x + i,
                y: topLeftCorner.y + j
            }));
        }
    }
    return cells;
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