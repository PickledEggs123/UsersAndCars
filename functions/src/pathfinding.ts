import {
    ENetworkObjectType,
    ENpcJobType,
    EOwnerType,
    IApiPersonsNpcJobPost,
    INpc,
    INpcPathPoint
} from "persons-game-common/lib/types/GameTypes";
import {
    IHouseDatabase,
    INetworkObjectDatabase,
    INpcCellTimeDatabase,
    INpcDatabase,
    IResourceDatabase,
    IStockpileDatabase
} from "./types/database";
import {cellSize} from "./config";
import * as admin from "firebase-admin";
import {getNetworkObjectCellString} from "./cell";
import {CellController} from "persons-game-common/lib/npc";
import {
    houseDatabaseToClient,
    networkObjectClientToDatabase,
    networkObjectDatabaseToClient,
    npcClientToDatabase,
    npcDatabaseToClient,
    resourceClientToDatabase,
    resourceDatabaseToClient,
    stockpileClientToDatabase,
    stockpileDatabaseToClient
} from "./common";
import * as express from "express";

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
    const dCellX = Math.floor(b.location.x / cellSize) - Math.floor(a.location.x / cellSize);
    const dCellY = Math.floor(b.location.y / cellSize) - Math.floor(a.location.y / cellSize);
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
                return (cellSize - positionInCell) / (dv * 1000);
            } else if (dv < 0) {
                return (-positionInCell) / (dv * 1000);
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
    const cellTimesWithDuplicates: INpcCellTimeDatabase[] = [];

    const firstPoint = path[0];
    const lastPoint = path[path.length - 1];
    if (firstPoint) {
        // initial cell
        cellTimesWithDuplicates.push({
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
                cellTimesWithDuplicates.push(...findCellTimesBetweenTwoPathPoints(npc, a, b));
            }
        }

        // final cell
        cellTimesWithDuplicates.push({
            npcId: npc.id,
            startTime: admin.firestore.Timestamp.fromMillis(Math.round(Date.parse(lastPoint.time))),
            endTime: admin.firestore.Timestamp.fromMillis(Math.round(Date.parse(lastPoint.time) + 10 * 1000)),
            cell: getNetworkObjectCellString(lastPoint.location),
            expired: false
        });
    } else {
        // no path data, render one cell time
        cellTimesWithDuplicates.push({
            npcId: npc.id,
            startTime: admin.firestore.Timestamp.now(),
            endTime: admin.firestore.Timestamp.fromMillis(+new Date() + 60 * 1000),
            cell: getNetworkObjectCellString(npc),
            expired: false
        });
    }

    // reduce duplicate cell times
    return cellTimesWithDuplicates.reduce((acc: INpcCellTimeDatabase[], cellTime: INpcCellTimeDatabase): INpcCellTimeDatabase[] => {
        const lastCellTime = acc[0];
        if (lastCellTime && cellTime.cell === lastCellTime.cell) {
            lastCellTime.endTime = cellTime.endTime;
            return acc;
        } else {
            return [
                ...acc,
                {
                    ...cellTime
                }
            ]
        }
    }, []);
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
    const stockpileQuery = await admin.firestore().collection("stockpiles").where("cell", "==", cellString).get();
    const npcTimeQuery = await admin.firestore().collection("npcTimes").where("cell", "==", cellString).get();
    const expiredNpcTimeIds = npcTimeQuery.docs.filter(doc => {
        const cellTime = doc.data() as INpcCellTimeDatabase;
        return +new Date() > cellTime.endTime.toMillis();
    }).map(doc => doc.id);

    const houses = houseQuery.docs.map(doc => houseDatabaseToClient(doc.data() as IHouseDatabase));
    const objects = objectQuery.docs.map(doc => networkObjectDatabaseToClient(doc.data() as INetworkObjectDatabase));
    const resources = resourceQuery.docs.map(doc => {
        return resourceDatabaseToClient(doc.data() as IResourceDatabase);
    });
    const stockpiles = stockpileQuery.docs.map(doc => {
        return stockpileDatabaseToClient(doc.data() as IStockpileDatabase);
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
                lastUpdate: new Date().toISOString(),
                readyTime: new Date().toISOString(),
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
                objectType: ENetworkObjectType.PERSON,
                inventoryState: [],
                job: {
                    type: ENpcJobType.GATHER
                }
            };
            npcs.push(newNpc);
        }
    }

    const controller = new CellController({
        houses,
        objects,
        npcs,
        resources,
        stockpiles
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
        }),
        ...finalState.stockpiles.map(stockpile => {
            return admin.firestore().collection("stockpiles").doc(stockpile.id).set(stockpileClientToDatabase(stockpile), {merge: true});
        }),
        ...expiredNpcTimeIds.map(id => {
            return admin.firestore().collection("npcTimes").doc(id).delete();
        })
    ])
};

export const handleSetNpcJob = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        const {
            personId,
            npcId,
            job
        } = req.body as IApiPersonsNpcJobPost;

        const personDocument = await admin.firestore().collection("persons").doc(personId).get();
        const npcDocument = await admin.firestore().collection("npcs").doc(npcId).get();
        const houseQuery = await admin.firestore().collection("houses")
            .where("npcId", "==", npcId).limit(1).get();
        if (personDocument.exists && npcDocument.exists && !houseQuery.empty) {
            // objects exist in database
            const houseDatabase = houseQuery.docs[0].data() as IHouseDatabase;
            if (houseDatabase.ownerType === EOwnerType.PERSON && houseDatabase.ownerId === personId) {
                // person has permission to edit npc
                await npcDocument.ref.set({job}, {merge: true});
            } else {
                throw new Error("Person does not have permission to edit the npc");
            }
        } else {
            throw new Error("Person, Npc, or Npc House does not exist");
        }
    })().catch((err) => next(err));
};
