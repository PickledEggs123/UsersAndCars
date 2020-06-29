import {ILot, INetworkObjectCellPosition, IObject} from "persons-game-common/lib/types/GameTypes";
import {getNetworkObjectWorldCellPosition, networkObjectCellPositionToCellString} from "persons-game-common/lib/cell";

/**
 * Cells are invisible lines that divide the world space into squares. Each cell is used to quickly filter objects that
 * are near the player. Each cell is represented by a string. The string can be filtered with a '==' or 'in' where
 * clause.
 */

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
export const getRelevantNetworkObjectCells = (networkObject: IObject): INetworkObjectCellPosition[] => {
    // gt network object world cell position
    const {x, y} = getNetworkObjectWorldCellPosition(networkObject);

    // pick the current cell and the 3 other cells around the nearest corner, return 4 cells
    const cellsToLoad: INetworkObjectCellPosition[] = [];
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            cellsToLoad.push({
                x: x + i,
                y: y + j
            });
        }
    }
    return cellsToLoad;
};
/**
 * Get a list of relevant world cells to filter by.
 * @param networkObject The network object to filter by.
 */
export const getRelevantNetworkObjectCellIds = (networkObject: IObject): string[] => {
    return getRelevantNetworkObjectCells(networkObject).map(networkObjectCellPositionToCellString);
};
