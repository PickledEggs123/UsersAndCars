import {ENetworkObjectType, IHouse, INpc, INpcPathPoint} from "persons-game-common/lib/types/GameTypes";
import {INetworkObjectDatabase, INpcCellTimeDatabase, INpcDatabase, IResourceDatabase} from "./types/database";
import {cellSize} from "./config";
import * as admin from "firebase-admin";
import {getNetworkObjectCellString} from "./cell";
import {CellController} from "persons-game-common/lib/npc";
import {
    networkObjectClientToDatabase,
    networkObjectDatabaseToClient,
    npcClientToDatabase,
    npcDatabaseToClient, resourceClientToDatabase,
    resourceDatabaseToClient
} from "./common";

/**
 * Handle pathfinding AI for each NPC.
 */

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
                    }),
                    expired: false
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
            }),
            expired: false
        });
    } else {
        // no cell change, return the cell location for the two points
        cellTimes.push({
            npcId: npc.id,
            startTime: admin.firestore.Timestamp.fromMillis(Math.round(Date.parse(a.time))),
            endTime: admin.firestore.Timestamp.fromMillis(Math.round(Date.parse(b.time))),
            cell: getNetworkObjectCellString(a.location),
            expired: false
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
            cell: getNetworkObjectCellString(npc),
            expired: false
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
            cell: getNetworkObjectCellString(lastPoint.location),
            expired: false
        });
    } else {
        // no path data, render one cell time
        cellTimes.push({
            npcId: npc.id,
            startTime: admin.firestore.Timestamp.now(),
            endTime: admin.firestore.Timestamp.fromDate(longTimeFromNow),
            cell: getNetworkObjectCellString(npc),
            expired: false
        });
    }

    return cellTimes;
};

/**
 * Animate the NPCs within a cell by making them cut down trees.
 * @param cellString The cell string to animate.
 * @param milliseconds The amount of time to animate.
 */
export const simulateCell = async (cellString: string, milliseconds: number) => {
    const houseQuery = await admin.firestore().collection("houses").where("cell", "==", cellString).get();
    const objectQuery = await admin.firestore().collection("objects").where("cell", "==", cellString).get();
    const resourceQuery = await admin.firestore().collection("resources").where("cell", "==", cellString).get();

    const houses = houseQuery.docs.map(doc => doc.data() as IHouse);
    const objects = objectQuery.docs.map(doc => networkObjectDatabaseToClient(doc.data() as INetworkObjectDatabase));
    const resources = resourceQuery.docs.map(doc => {
        return resourceDatabaseToClient(doc.data() as IResourceDatabase);
    });

    const npcs: INpc[] = [];
    for (const house of houses) {
        const npcId = house.npcId;
        const doc = await admin.firestore().collection("npcs").doc(npcId).get();
        if (doc.exists) {
            npcs.push(npcDatabaseToClient(doc.data() as INpcDatabase));
        } else {
            const newNpc: INpc = {
                id: npcId,
                x: house.x,
                y: house.y,
                path: [],
                carId: null,
                craftingSeed: `npc-${npcId}`,
                craftingState: true,
                cash: 0,
                creditLimit: 0,
                pantColor: "tan",
                shirtColor: "green",
                schedule: [],
                state: [],
                lastUpdate: new Date().toISOString(),
                readyTime: new Date().toISOString(),
                grabbedByPersonId: null,
                grabbedByNpcId: null,
                isInInventory: false,
                inventory: {
                    rows: 1,
                    columns: 10,
                    slots: []
                },
                health: {
                    rate: 1,
                    max: 10,
                    value: 10
                },
                amount: 1,
                exist: true,
                objectType: ENetworkObjectType.PERSON,
                inventoryState: []
            };
            npcs.push(newNpc);
        }
    }

    const controller = new CellController({
        houses,
        objects,
        npcs,
        resources
    });

    controller.run(milliseconds);
    const finalState = controller.getState();

    await Promise.all([
        ...finalState.npcs.reduce((acc: Promise<any>[], npc: INpc): Promise<any>[] => {
            const npcDatabase: INpcDatabase = npcClientToDatabase(npc) as INpcDatabase;
            return [
                admin.firestore().collection("npcs").doc(npc.id).set(npcDatabase, {merge: true}),
                ...findCellTimesInPath(npcDatabase, npcDatabase.path).map(cellTime => {
                    return admin.firestore().collection("npcTimes").add(cellTime);
                })
            ];
        }, []),
        ...finalState.objects.map(obj => {
            return admin.firestore().collection("objects").doc(obj.id).set(networkObjectClientToDatabase(obj), {merge: true});
        }),
        ...finalState.resources.map(resource => {
            return admin.firestore().collection("resources").doc(resource.id).set(resourceClientToDatabase(resource), {merge: true});
        })
    ])
};
