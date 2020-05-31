import {ILotFiller, ILotFillerLotAndObjects} from "./types/database";
import {
    ELotExpandType,
    ELotZone,
    ENetworkObjectType,
    ERoadDirection,
    ERoadType,
    ICity,
    ILot,
    ILotExpandTypeAndAffectedLocations,
    INetworkObject,
    IObject,
    IRoad,
    IVendor,
    IWhichDirectionIsNearby
} from "persons-game-common/lib/types/GameTypes";

/**
 * Handle the creation of a city.
 */

/**
 * Lot is at location and zone matches.
 * @param location The location to check.
 * @param zone The zone of the located lot.
 */
const lotAtLocation = (location: IObject, zone: ELotZone) => (lot: ILot): boolean => {
    return Math.abs(lot.x - location.x) <= 10 && Math.abs(lot.y - location.y) <= 10 && lot.zone === zone;
};
/**
 * Determine the type of lot expansion to perform.
 * @param lot The lot to check.
 * @param lots The lots to expand into.
 */
const getLotExpandTypeAndAffectedLocations = (lot: ILot, lots: ILot[]): ILotExpandTypeAndAffectedLocations => {
    // the tile position of the lot
    const lotXInTiles = Math.round(lot.x / 500);
    const lotYInTiles = Math.round(lot.y / 300);
    // the lot width and height in tiles
    const lotWidthInTiles = Math.round(lot.width / 500);
    const lotHeightInTitles = Math.round(lot.height / 300);

    // a line on the right side of the square, lot can expand into the right row
    const rightLocations = new Array(lotHeightInTitles).fill(0).map((v, i): IObject => ({
        x: (lotXInTiles + lotWidthInTiles) * 500,
        y: (lotYInTiles + i) * 300
    }));
    // a line on the bottom of the square, lot can expand into the bottom row
    const bottomLocations = new Array(lotWidthInTiles).fill(0).map((v, i): IObject => ({
        x: (lotXInTiles + i) * 500,
        y: (lotYInTiles + lotHeightInTitles) * 300
    }));
    // a corner square, lot can expand into both right and bottom if the corner is filled
    const cornerLocation: IObject = {
        x: (lotXInTiles + lotWidthInTiles) * 500,
        y: (lotYInTiles + lotHeightInTitles) * 300
    };

    // determine if positions are filled
    const isRightFilled = rightLocations.every(location => {
        return lots.some(lotAtLocation(location, lot.zone));
    });
    const isBottomFilled = bottomLocations.every(location => {
        return lots.some(lotAtLocation(location, lot.zone));
    });
    const isCornerFilled = lots.some(lotAtLocation(cornerLocation, lot.zone));

    // depending on which tile positions are filled
    if (isRightFilled && isBottomFilled && isCornerFilled) {
        // return bottom and right affected lots
        return {
            lotExpandType: ELotExpandType.RIGHT_AND_BOTTOM,
            affectedLots: [
                ...rightLocations.reduce((arr: ILot[], location: IObject): ILot[] => {
                    const l = lots.find(lotAtLocation(location, lot.zone));
                    if (l) {
                        return [...arr, l];
                    } else {
                        return arr;
                    }
                }, []),
                ...bottomLocations.reduce((arr: ILot[], location: IObject): ILot[] => {
                    const l = lots.find(lotAtLocation(location, lot.zone));
                    if (l) {
                        return [...arr, l];
                    } else {
                        return arr;
                    }
                }, []),
                ...lots.filter(lotAtLocation(cornerLocation, lot.zone))
            ]
        };
    } else if (isRightFilled) {
        // return right affected lots
        return {
            lotExpandType: ELotExpandType.RIGHT,
            affectedLots: [
                ...rightLocations.reduce((arr: ILot[], location: IObject): ILot[] => {
                    const l = lots.find(lotAtLocation(location, lot.zone));
                    if (l) {
                        return [...arr, l];
                    } else {
                        return arr;
                    }
                }, [])
            ]
        };
    } else if (isBottomFilled) {
        // return bottom affected lots
        return {
            lotExpandType: ELotExpandType.BOTTOM,
            affectedLots: [
                ...bottomLocations.reduce((arr: ILot[], location: IObject): ILot[] => {
                    const l = lots.find(lotAtLocation(location, lot.zone));
                    if (l) {
                        return [...arr, l];
                    } else {
                        return arr;
                    }
                }, [])
            ]
        };
    } else {
        return {
            lotExpandType: ELotExpandType.NONE,
            affectedLots: []
        };
    }
};
const lotFillers: ILotFiller[] = [{
    width: 2500,
    height: 1200,
    zone: ELotZone.RESIDENTIAL,
    fillLot(lot: ILot): ILotFillerLotAndObjects {
        return {
            lot: {
                ...lot,
                format: "" +
                    "  E  \n" +
                    "OHHO \n" +
                    "OHOH \n" +
                    " E   "
            },
            objects: []
        };
    }
}, {
    width: 2500,
    height: 900,
    zone: ELotZone.RESIDENTIAL,
    fillLot(lot: ILot): ILotFillerLotAndObjects {
        return {
            lot: {
                ...lot,
                format: "" +
                    "OE EO\n" +
                    "HH HH\n" +
                    "OE EO"
            },
            objects: []
        };
    }
}, {
    width: 2500,
    height: 1200,
    zone: ELotZone.COMMERCIAL,
    fillLot(lot: ILot): ILotFillerLotAndObjects {
        return {
            lot: {
                ...lot,
                format: "" +
                    "  E  \n" +
                    "OHHHH\n" +
                    "OHHHH\n" +
                    "  E  "
            },
            objects: [{
                x: lot.x + 1250,
                y: lot.y + 600,
                objectType: ENetworkObjectType.VENDING_MACHINE,
                grabbedByPersonId: null,
                id: `lot-${lot.x}-${lot.y}-vending-machine`,
                lastUpdate: new Date().toISOString(),
                inventory: [{
                    price: 3000,
                    objectType: ENetworkObjectType.CAR
                }, {
                    price: 10,
                    objectType: ENetworkObjectType.BOX
                }]
            } as IVendor] as INetworkObject[]
        };
    }
}, {
    width: 2500,
    height: 900,
    zone: ELotZone.COMMERCIAL,
    fillLot(lot: ILot): ILotFillerLotAndObjects {
        return {
            lot: {
                ...lot,
                format: "" +
                    "  E  \n" +
                    "OHHHO\n" +
                    "  E  "
            },
            objects: []
        };
    }
}];
/**
 * Fill a lot with rooms.
 * @param lot The lot to fill.
 */
const fillLot = (lot: ILot): ILotFillerLotAndObjects => {
    const lotFiller = lotFillers.find(l => l.width === lot.width && l.height === lot.height && l.zone === lot.zone);
    if (lotFiller) {
        return lotFiller.fillLot(lot);
    } else {
        return {
            lot,
            objects: [] as INetworkObject[]
        };
    }
};
const generateLotId = (lot: ILot): string => `city1-${lot.zone}(${lot.x},${lot.y})`;
/**
 * Generate lots and objects within the lots.
 * @param format The format string of the city. Lots will populate an ASCII map of the city.
 * @param x The x offset of the city.
 * @param y The y offset of the city.
 */
export const generateLots = ({format, offset: {x, y}}: { format: string, offset: IObject }): { lots: ILot[], objects: INetworkObject[] } => {
    let lots = [] as ILot[];

    // generate a lot for each zoning character
    const rows = format.split(/\r\n|\r|\n/);
    rows.forEach((row, rowIndex) => {
        const zones = row.split("");
        zones.forEach((zone, columnIndex) => {
            switch (zone) {
                case "R": {
                    const lot: ILot = {
                        owner: null,
                        format: null,
                        width: 500,
                        height: 300,
                        x: x + columnIndex * 500,
                        y: y + rowIndex * 300,
                        zone: ELotZone.RESIDENTIAL,
                        id: "",
                        buyOffers: null,
                        sellOffers: null
                    };
                    lot.id = generateLotId(lot);
                    lots.push(lot);
                    break;
                }
                case "C": {
                    const lot: ILot = {
                        owner: null,
                        format: null,
                        width: 500,
                        height: 300,
                        x: x + columnIndex * 500,
                        y: y + rowIndex * 300,
                        zone: ELotZone.COMMERCIAL,
                        id: "",
                        buyOffers: null,
                        sellOffers: null
                    };
                    lot.id = generateLotId(lot);
                    lots.push(lot);
                    break;
                }
                case "I": {
                    const lot: ILot = {
                        owner: null,
                        format: null,
                        width: 500,
                        height: 300,
                        x: x + columnIndex * 500,
                        y: y + rowIndex * 300,
                        zone: ELotZone.INDUSTRIAL,
                        id: "",
                        buyOffers: null,
                        sellOffers: null
                    };
                    lot.id = generateLotId(lot);
                    lots.push(lot);
                    break;
                }
            }
        });
    });

    // merge lots into their neighbors
    for (const firstLot of lots) {
        let exitLoop = false;
        for (let depth = 1; depth < 5 && !exitLoop; depth++) {
            const {affectedLots, lotExpandType} = getLotExpandTypeAndAffectedLocations(firstLot, lots);
            switch (lotExpandType) {
                case ELotExpandType.RIGHT_AND_BOTTOM: {
                    // expand lot both right and bottom
                    firstLot.width += 500;
                    firstLot.height += 300;
                    break;
                }
                case ELotExpandType.RIGHT: {
                    // expand lot to the right
                    firstLot.width += 500;
                    break;
                }
                case ELotExpandType.BOTTOM: {
                    // expand lot to the bottom
                    firstLot.height += 300;
                    break;
                }
                case ELotExpandType.NONE: {
                    exitLoop = true;
                    break;
                }
            }

            // remove affected lots
            lots = lots.filter(lot => !affectedLots.some(lotAtLocation(lot, firstLot.zone)));
        }
    }

    // generate rooms and objects per lot
    const lotAndObjects = lots.map(fillLot);

    // merge into two lists
    const lotAndObjectsMerge = lotAndObjects.reduce(({lotArr, objectsArr}: { lotArr: ILot[], objectsArr: INetworkObject[] }, lotAndObjectsItem): { lotArr: ILot[], objectsArr: INetworkObject[] } => {
        return {
            lotArr: [...lotArr, lotAndObjectsItem.lot],
            objectsArr: [...objectsArr, ...lotAndObjectsItem.objects]
        };
    }, {
        lotArr: [],
        objectsArr: []
    });
    lots = lotAndObjectsMerge.lotArr;
    const objects = lotAndObjectsMerge.objectsArr;

    return {
        lots,
        objects
    };
};

/**
 * Determine if room is nearby another room.
 * @param a The room to test being nearby room b.
 */
const tileIsNearbyTile = (a: IObject) => (b: IObject) => {
    return b.x >= a.x - 500 && b.x <= a.x + 500 && b.y >= a.y - 300 && b.y <= a.y + 300;
};

/**
 * Return which doors should be open given a room and an array of nearby rooms.
 * @param tile The room which doors should be computed.
 * @param nearbyTiles The array of nearby rooms.
 */
const whichDirectionIsNearby = (tile: IObject, nearbyTiles: IObject[]): IWhichDirectionIsNearby => {
    const up = nearbyTiles.some((nearbyTile) => {
        return Math.abs(nearbyTile.x - tile.x) < 10 && Math.abs(nearbyTile.y - tile.y + 300) < 10;
    });
    const down = nearbyTiles.some((nearbyTile) => {
        return Math.abs(nearbyTile.x - tile.x) < 10 && Math.abs(nearbyTile.y - tile.y - 300) < 10;
    });
    const left = nearbyTiles.some((nearbyTile) => {
        return Math.abs(nearbyTile.y - tile.y) < 10 && Math.abs(nearbyTile.x - tile.x + 500) < 10;
    });
    const right = nearbyTiles.some((nearbyTile) => {
        return Math.abs(nearbyTile.y - tile.y) < 10 && Math.abs(nearbyTile.x - tile.x - 500) < 10;
    });

    return {
        up,
        down,
        left,
        right
    } as IWhichDirectionIsNearby;
};

/**
 * Apply doors onto the room mutably.
 * @param road The room which should be modified with new doors.
 * @param whichDoorsShouldBeOpen The doors to open.
 */
const applyRoadConnections = (road: IRoad, whichDoorsShouldBeOpen: IWhichDirectionIsNearby): void => {
    road.connected = {
        ...road.connected,
        ...whichDoorsShouldBeOpen
    };
};

/**
 * Generate roads for a city.
 * @param format A string containing an ASCII map of the city.
 * @param x The offset of the city.
 * @param y The offset of the city.
 */
const generateRoads = ({format, offset: {x, y}}: {format: string, offset: IObject}): IRoad[] => {
    const roads = [] as IRoad[];

    // parse all roads
    const rows = format.split(/\r\n|\r|\n/);
    rows.forEach((row, rowIndex) => {
        const tiles = row.split("");
        tiles.forEach((tile, columnIndex) => {
            switch (tile) {
                case "|": {
                    const road: IRoad = {
                        id: "",
                        x: x + columnIndex * 500,
                        y: y + rowIndex * 300,
                        type: ERoadType.TWO_LANE,
                        direction: ERoadDirection.VERTICAL,
                        connected: {
                            up: false,
                            down: false,
                            left: false,
                            right: false
                        }
                    };
                    road.id = `city1-road(${road.x},${road.y})`;
                    roads.push(road);
                    break;
                }
                case "-": {
                    const road: IRoad = {
                        id: "",
                        x: columnIndex * 500,
                        y: rowIndex * 300,
                        type: ERoadType.TWO_LANE,
                        direction: ERoadDirection.HORIZONTAL,
                        connected: {
                            up: false,
                            down: false,
                            left: false,
                            right: false
                        }
                    };
                    road.id = `city1-road(${road.x},${road.y})`;
                    roads.push(road);
                    break;
                }
            }
        });
    });

    // connect roads to each other
    roads.forEach(road => {
        const nearbyRoads = roads.filter(tileIsNearbyTile(road));
        const whichDirectionShouldBeConnected = whichDirectionIsNearby(road, nearbyRoads);
        applyRoadConnections(road, whichDirectionShouldBeConnected);
    });

    return roads;
};

/**
 * Generate a city from an ASCII map.
 * @param format The ASCII map of the city.
 * @param x The x offset of the city.
 * @param y The y offset of the city.
 */
export const generateCity = ({format, offset: {x, y}}: {format: string, offset: IObject}): ICity => {
    const roads = generateRoads({format, offset: {x, y}});
    const {lots, objects} = generateLots({format, offset: {x, y}});

    return {
        roads,
        lots,
        objects
    };
};