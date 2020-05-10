import {
    ECarDirection,
    ELotZone,
    ENetworkObjectType,
    ILot,
    INetworkObject,
    INpcPathPoint, INpcSchedule,
    IObjectHealth, IResourceSpawn
} from "./GameTypes";
import * as admin from "firebase-admin";
import * as seedrandom from "seedrandom";

export interface ILotFillerLotAndObjects {
    lot: ILot;
    objects: INetworkObject[];
}

/**
 * A list of lot fillers. They fill the lot with a format string given a dimension and zone type.
 */
export interface ILotFiller {
    width: number;
    height: number;
    zone: ELotZone;

    fillLot(lot: ILot): ILotFillerLotAndObjects;
}

/**
 * Used to filter by cells as the NPC travel along a path.
 */
export interface INpcCellTimeDatabase {
    /**
     * The id of the NPC.
     */
    npcId: string;
    /**
     * The start time of the NPC being in a cell.
     */
    startTime: admin.firestore.Timestamp;
    /**
     * The end time of the NPC being in a cell.
     */
    endTime: admin.firestore.Timestamp;
    /**
     * The cell the NPC is in.
     */
    cell: string;
    /**
     * If the time cell has expired.
     */
    expired: boolean;
}

/**
 * Person API
 * The following code implement CRUD, Create, Read, (Update missing), Destroy for all car objects using firebase functions
 * to process JSON REST API calls that update a firebase firestore database. The nice feature of using firebase functions
 * is that you pay per invocation or each time the api is called instead of a constant 24/7 uptime. You can break even
 * if you use the API for less than 12 hours out of a 24 hour day.
 */

/**
 * An object that should be networked in multiplayer.
 */
export interface INetworkObjectDatabase {
    id: string;
    x: number;
    y: number;
    objectType: ENetworkObjectType;
    grabbedByPersonId: string | null;
    grabbedByNpcId: string | null;
    isInInventory: boolean;
    lastUpdate: admin.firestore.Timestamp;
    health: IObjectHealth;
    cell: string;
    amount: number;
}

/**
 * The intermediate world cell type.
 */
export interface INetworkObjectCellPosition {
    /**
     * X axis cell number.
     */
    x: number;
    /**
     * Y axis cell number.
     */
    y: number;
}

export interface IPersonsInventoryDatabase {
    rows: number;
    columns: number;
    slots: INetworkObjectDatabase[];
}

export interface IPersonDatabase extends INetworkObjectDatabase {
    shirtColor: string;
    pantColor: string;
    carId: string | null;
    password: string;
    objectType: ENetworkObjectType.PERSON;
    cash: number;
    creditLimit: number;
    inventory: IPersonsInventoryDatabase;
}

export interface INpcDatabase extends IPersonDatabase {
    path: INpcPathPoint[];
    directionMap: string;
    doneWalking: admin.firestore.Timestamp;
    /**
     * A list of actions to perform every 4 hours.
     */
    schedule: INpcSchedule[];
}

export interface ICarDatabase extends INetworkObjectDatabase {
    direction: ECarDirection;
    objectType: ENetworkObjectType;
}

export interface IResourceDatabase extends INetworkObjectDatabase {
    spawnSeed: string;
    spawns: IResourceSpawn[];
    spawnState: seedrandom.State | true;
    depleted: boolean;
    readyTime: admin.firestore.Timestamp
}