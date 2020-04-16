import {ILot, INpcPathPoint, IObject} from "./types/GameTypes";
import {INpcCellTimeDatabase, INpcDatabase} from "./types/database";
import {cellSize} from "./config";
import * as admin from "firebase-admin";
import {getNetworkObjectCellString} from "./cell";
import {generateLots} from "./city";

/**
 * Handle pathfinding AI for each NPC.
 */

/**
 * Find the nth regex position in the string.
 * @param format The string to search.
 * @param regex The regex to search.
 * @param nth The number of times the regex occurred.
 */
const findPositionOfNthOccurrence = (format: string, regex: RegExp, nth: number): number => {
    if (nth < 0) {
        return 0;
    } else {
        // @ts-ignore
        const matches = format.matchAll(regex);
        if (matches) {
            const match = Array.from(matches)[nth];
            // @ts-ignore
            if (match && typeof match.index === "number") {
                // @ts-ignore
                return match.index + match.length;
            }
        }
        return -1;
    }
};
/**
 * Create a map of the city where zones are replaced with the rooms in a lot.
 * @param format The format string of the city without rooms.
 * @param offset The offset of the city map.
 * @param lots The lots on the city map that contain room information.
 */
const createCityMapWithRooms = ({format, offset, lots}: { format: string, offset: IObject, lots: ILot[] }): string => {
    let cityMapWithRooms = format;
    for (const lot of lots) {
        // get dimension and position of the lot in tiles
        const xTile = Math.round((lot.x - offset.x) / 500);
        const yTile = Math.round((lot.y - offset.y) / 300) - 1;
        const xWidth = Math.round(lot.width / 500);

        // if there is lot information
        if (lot.format) {
            // for each lot ASCII row
            const rows = lot.format.split(/\r|\n|\r\n/);
            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                const row = rows[rowIndex];
                // insert lot row into city map
                const cityFormatRowStart = findPositionOfNthOccurrence(format, /\r|\n|\r\n/g, yTile + rowIndex);
                cityMapWithRooms = `${cityMapWithRooms.slice(0, cityFormatRowStart + xTile)}${row}${cityMapWithRooms.slice(cityFormatRowStart + xTile + xWidth)}`;
            }
        }
    }

    return cityMapWithRooms;
};
const generateDirectionMapTowardsTile = ({cityMapWithRooms, offset, to}: {
    cityMapWithRooms: string,
    offset: IObject,
    to: IObject
}): string => {
    const newLineRegex = /\r|\n|\r\n/g;

    const rows = cityMapWithRooms.split(newLineRegex);

    // generate weight map
    const weightMap: {
        [key: string]: {
            tile: string;
            weight: number;
            direction: string;
        }
    } = {};
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
            weightMap[`${rowIndex},${columnIndex}`] = {
                tile: row[columnIndex],
                weight: Infinity,
                direction: ""
            };
        }
    }

    /**
     * Tile weights of different tiles.
     */
    const tileWeights: {
        [tile: string]: number
    } = {
        "|": 5,
        "-": 3,
        "E": 20,
        "H": 40,
        "O": 100,
        " ": 1000
    };

    // the destination in tile coordinates
    const destinationXTile = Math.round((to.x - offset.x) / 500);
    const destinationYTile = Math.round((to.y - offset.y) / 300);

    {
        // mark destination on weight map
        const data = weightMap[`${destinationYTile},${destinationXTile}`];
        if (data) {
            data.weight = 0;
            data.direction = "*";
        }
    }

    /**
     * Update the weight and direction of the weight map.
     * @param currentTile The center tile.
     * @param neighborTile The side tile next to the center tile.
     * @param direction The direction arrow from neighborTile to currentTile.
     */
    const updateWeightAndDirection = (currentTile: { tile: string; weight: number; }, neighborTile: { tile: string; weight: number; direction: any; }, direction: any) => {
        if (currentTile && neighborTile) {
            const tileTransitionWeight = tileWeights[neighborTile.tile] || Infinity;
            const newWeight = currentTile.weight + tileTransitionWeight;
            if (newWeight <= neighborTile.weight) {
                neighborTile.weight = newWeight;
                neighborTile.direction = direction;
            }
        }
    };

    // for a number of steps
    const numRows = rows.length;
    const numColumns = rows.reduce((acc: number, row: string): number => {
        return Math.max(acc, row.length);
    }, 0);
    const numSteps = numRows + numColumns;
    for (let step = 0; step < numSteps; step++) {
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
                const data = weightMap[`${rowIndex},${columnIndex}`];
                const dataLeft = weightMap[`${rowIndex},${columnIndex - 1}`];
                const dataRight = weightMap[`${rowIndex},${columnIndex + 1}`];
                const dataTop = weightMap[`${rowIndex - 1},${columnIndex}`];
                const dataBottom = weightMap[`${rowIndex + 1},${columnIndex}`];
                if (data) {
                    /**
                     * The position relative to destination tile is needed for direction bias towards destination.
                     * the last updateWeightAndDirection will override the previous direction. By changing the order
                     * of the function calls, the graph will not be biased towards the bottom of the graph.
                     */
                    const deltaX = columnIndex - destinationXTile;
                    const deltaY = rowIndex - destinationYTile;

                    const handleLeftRightDirections = () => {
                        // depending on position relative from destination
                        if (deltaX > 0) {
                            // left of destination
                            updateWeightAndDirection(data, dataLeft, "→");
                            updateWeightAndDirection(data, dataRight, "←");
                        } else {
                            // right of destination
                            updateWeightAndDirection(data, dataRight, "←");
                            updateWeightAndDirection(data, dataLeft, "→");
                        }
                    };
                    const handleUpDownDirections = () => {
                        // depending on position relative to destination
                        if (deltaY > 0) {
                            // below destination
                            updateWeightAndDirection(data, dataTop, "↓");
                            updateWeightAndDirection(data, dataBottom, "↑");
                        } else {
                            // above destination
                            updateWeightAndDirection(data, dataBottom, "↑");
                            updateWeightAndDirection(data, dataTop, "↓");
                        }
                    };

                    // change the order of updateWeightAndDirection depending on position relative to destination
                    if (Math.abs(deltaX) > Math.abs(deltaY)) {
                        handleUpDownDirections();
                        handleLeftRightDirections();
                    } else {
                        handleLeftRightDirections();
                        handleUpDownDirections();
                    }
                }
            }
        }
    }

    // render directionMap into a string
    return rows.map((row, rowIndex) => {
        return row.split("").map((tile, columnIndex) => {
            const data = weightMap[`${rowIndex},${columnIndex}`];
            if (data) {
                return data.direction;
            } else {
                return " ";
            }
        }).join("");
    }).join("\n");
};
/**
 * Generate a path on the direction map from a location to the destination.
 * @param directionMap The direction map used for pathfinding.
 * @param offset The offset of the direction map.
 * @param from The initial location.
 */
const findPathOnDirectionMap = ({directionMap, offset, from}: {
    directionMap: string,
    offset: IObject,
    from: IObject
}): INpcPathPoint[] => {
    /**
     * Get the tile character at the specific point
     * @param x X tile position
     * @param y Y tile position
     */
    const getTile = (x: number, y: number): string | undefined => {
        const rows = directionMap.split(/\r|\n|\r\n/);
        const row = rows[y];
        if (row) {
            const tileCharacter = row[x];
            if (tileCharacter) {
                return tileCharacter;
            }
        }
        return undefined;
    };

    // information about the current position and time, iterated while path is being generated.
    let xTile = Math.floor((from.x - offset.x) / 500);
    let yTile = Math.floor((from.y - offset.y) / 300);
    let tile: string | undefined = getTile(xTile, yTile);
    let lastTile: string | undefined;
    let timeSinceStart: number = 0;

    const path: INpcPathPoint[] = [];
    const now = new Date();
    const timeVertical = 3000;
    const timeHorizontal = 5000;

    // initial location
    path.push({
        time: now.toISOString(),
        location: from
    });

    let endLoop: boolean = false;
    for (let step = 0; step < 100 && !endLoop; step++) {
        // move and add time to path
        switch (tile) {
            case "↑": {
                yTile -= 1;
                timeSinceStart += timeVertical;
                break;
            }
            case "↓": {
                yTile += 1;
                timeSinceStart += timeVertical;
                break;
            }
            case "←": {
                xTile -= 1;
                timeSinceStart += timeHorizontal;
                break;
            }
            case "→": {
                xTile += 1;
                timeSinceStart += timeHorizontal;
                break;
            }
            default:
            case "*": {
                // last path point stop
                if (lastTile && ["↑", "↓"].includes(lastTile)) {
                    timeSinceStart += timeVertical;
                }
                if (lastTile && ["←", "→"].includes(lastTile)) {
                    timeSinceStart += timeHorizontal;
                }
                endLoop = true;
                break;
            }
        }

        // update last and current tiles
        lastTile = tile;
        tile = getTile(xTile, yTile);

        // if the tile changed, generate a path point for the corner
        if (lastTile && tile !== lastTile) {
            path.push({
                time: new Date(timeSinceStart + +now).toISOString(),
                location: {
                    x: (xTile * 500) + offset.x + 250,
                    y: (yTile * 300) + offset.y + 150
                }
            });
        }
    }

    return path;
};
/**
 * Find cell times between two points of a path.
 * @param npc The npc that is traveling between two points.
 * @param a First point.
 * @param b Second point.
 */
const findCellTimesBetweenTwoPathPoints = (npc: INpcDatabase, a: INpcPathPoint, b: INpcPathPoint): INpcCellTimeDatabase[] => {
    const cellTimes: INpcCellTimeDatabase[] = [];

    // determine the number of times crossing a cell boundary
    const dCellX = Math.round(b.location.x / cellSize) - Math.round(a.location.x / cellSize);
    const dCellY = Math.round(b.location.y / cellSize) - Math.round(a.location.y / cellSize);
    const numberOfCellBoundaries = Math.abs(dCellX) + Math.abs(dCellY);
    if (numberOfCellBoundaries > 0) {
        // cell crossings, determine the times when crossing x or y cell boundaries
        const dx = b.location.x - a.location.x;
        const dy = b.location.y - a.location.y;
        let t = 0;

        // number of milliseconds to x boundary
        const getMillisecondsToBoundary = (v: number, dv: number): number | undefined => {
            // mod does not work correctly, -100 % 1000 = -100, should be 900
            const mod = (v + (dv * t)) % cellSize;
            const positionInCell = mod >= 0 ? mod : mod + cellSize;
            if (dv > 0) {
                return (cellSize - positionInCell) / dv * 1000;
            } else if (dv < 0) {
                return (-positionInCell) / dv * 1000;
            } else {
                return undefined;
            }
        };
        const getMillisecondsToXBoundary = () => {
            return getMillisecondsToBoundary(a.location.x, dx);
        };
        // number of milliseconds to x boundary
        const getMillisecondsToYBoundary = () => {
            return getMillisecondsToBoundary(a.location.y, dy);
        };

        for (let step = 0; step < numberOfCellBoundaries; step++) {
            const xTime = getMillisecondsToXBoundary();
            const yTime = getMillisecondsToYBoundary();

            if (typeof xTime === "number" && typeof yTime === "number") {
                const time = Math.min(xTime, yTime) + 10;
                const oldT = t;
                t += time;
                cellTimes.push({
                    npcId: npc.id,
                    startTime: admin.firestore.Timestamp.fromMillis(Math.round(Date.parse(a.time) + oldT)),
                    endTime: admin.firestore.Timestamp.fromMillis(Math.round(Date.parse(a.time) + t)),
                    cell: getNetworkObjectCellString({
                        x: a.location.x + dx * t,
                        y: a.location.y + dy * t
                    })
                });
            }
        }

        // final cell position
        cellTimes.push({
            npcId: npc.id,
            startTime: admin.firestore.Timestamp.fromMillis(Math.round(Date.parse(a.time) + t)),
            endTime: admin.firestore.Timestamp.fromMillis(Math.round(Date.parse(b.time))),
            cell: getNetworkObjectCellString({
                x: a.location.x + dx * t,
                y: a.location.y + dy * t
            })
        });
    } else {
        // no cell change, return the cell location for the two points
        cellTimes.push({
            npcId: npc.id,
            startTime: admin.firestore.Timestamp.fromMillis(Math.round(Date.parse(a.time))),
            endTime: admin.firestore.Timestamp.fromMillis(Math.round(Date.parse(b.time))),
            cell: getNetworkObjectCellString(a.location)
        });
    }

    return cellTimes;
};
/**
 * Find which cells the NPC will be in when traveling between two paths.
 * @param npc The npc to generate cell times for.
 * @param path The path the NPC is traveling.
 */
const findCellTimesInPath = (npc: INpcDatabase, path: INpcPathPoint[]): INpcCellTimeDatabase[] => {
    const cellTimes: INpcCellTimeDatabase[] = [];

    // pick a date 100 years from now, algorithm requires timespan to represent a non moving, always present NPC
    const longTimeFromNow = new Date();
    longTimeFromNow.setFullYear(longTimeFromNow.getFullYear() + 100);

    const firstPoint = path[0];
    const lastPoint = path[path.length - 1];
    if (firstPoint) {
        // initial cell
        cellTimes.push({
            npcId: npc.id,
            startTime: admin.firestore.Timestamp.now(),
            endTime: admin.firestore.Timestamp.fromDate(new Date(Date.parse(firstPoint.time))),
            cell: getNetworkObjectCellString(npc)
        });

        // for each line segment
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i];
            const b = path[i + 1];
            if (a && b) {
                cellTimes.push(...findCellTimesBetweenTwoPathPoints(npc, a, b));
            }
        }

        // final cell
        cellTimes.push({
            npcId: npc.id,
            startTime: admin.firestore.Timestamp.fromMillis(Math.round(Date.parse(lastPoint.time))),
            endTime: admin.firestore.Timestamp.fromDate(longTimeFromNow),
            cell: getNetworkObjectCellString(lastPoint.location)
        });
    } else {
        // no path data, render one cell time
        cellTimes.push({
            npcId: npc.id,
            startTime: admin.firestore.Timestamp.now(),
            endTime: admin.firestore.Timestamp.fromDate(longTimeFromNow),
            cell: getNetworkObjectCellString(npc)
        });
    }

    return cellTimes;
};
/**
 * Generate pathfinding data for a single street walker.
 */
export const streetWalkerPath = (npc: INpcDatabase, offset: IObject) => {
    // an ASCII map of the city
    const format = "" +
        "|-----|---------------|-----|---------------|-----|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|-----|---------------|-----|---------------|-----|\n" +
        "|CCCCC|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|CCCCC|\n" +
        "|CCCCC|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|CCCCC|\n" +
        "|CCCCC|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|CCCCC|\n" +
        "|-----|---------------|-----|---------------|-----|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|-----|---------------|-----|---------------|-----|";

    // create city map with rooms
    const {lots} = generateLots({format, offset});
    const cityMapWithRooms = createCityMapWithRooms({format, offset, lots});

    // pick random destination
    const generateRandomDestination = (): IObject => {
        const cityRows = cityMapWithRooms.split(/\r|\n|\r\n/);
        const randomCityY = Math.floor(Math.random() * cityRows.length);
        const randomCityRow = cityRows[randomCityY];
        const randomCityX = randomCityRow ? Math.floor(Math.random() * randomCityRow.length) : 0;
        return {
            x: randomCityX * 500,
            y: randomCityY * 300
        };
    };
    const to = generateRandomDestination();
    const from = {
        x: npc.x,
        y: npc.y
    };

    // generate path to destination
    const directionMap = generateDirectionMapTowardsTile({cityMapWithRooms, offset, to});
    const path = findPathOnDirectionMap({directionMap, offset, from});
    const cellTimes = findCellTimesInPath(npc, path);
    return {
        directionMap,
        path,
        cellTimes
    };
};