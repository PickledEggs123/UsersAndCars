import {
    ECarDirection,
    EDrawableType, EFloorPattern,
    ENetworkObjectType,
    ERoadDirection, EWallDirection, EWallPattern,
    ICar,
    IDrawable, IFloor, IHouse,
    ILot,
    INetworkObject, INetworkObjectBase,
    INpc,
    INpcPathPoint,
    IObject,
    IPerson,
    IResource,
    IRoad, IStockpile, IStockpileTile,
    ITree,
    IVendorInventoryItem, IWall
} from "persons-game-common/lib/types/GameTypes";
import React from "react";
import seedrandom from "seedrandom";
import {getMaxStackSize} from "persons-game-common/lib/inventory";
import {applyStateToNetworkObject, applyStateToResource} from "persons-game-common/lib/npc";

/**
 * Represent a leaf on a tree.
 */
interface ITreeLeaf extends IObject {
    id: string;
}

/**
 * The input into the base drawables class.
 */
export interface IPersonsDrawablesProps {}

/**
 * The state of the game component. The game state is stored in React so all changes to the game state will update the
 * SVG on the screen.
 */
export interface IPersonsDrawablesState {
    /**
     * The number of pixels of the game screen wide.
     */
    width: number;
    /**
     * The number of pixels of the game screen is tall.
     */
    height: number;
    /**
     * A list of persons from the network.
     */
    persons: IPerson[];
    /**
     * A list of NPCs from the network.
     */
    npcs: INpc[];
    /**
     * A list of objects in the area.
     */
    objects: INetworkObject[];
    /**
     * A cached list of nearby objects in the area.
     */
    nearbyObjects: INetworkObject[];
    /**
     * A list of houses.
     */
    houses: IHouse[];
    /**
     * A list of walls.
     */
    walls: IWall[];
    /**
     * A list of floors.
     */
    floors: IFloor[];
    /**
     * A list of cars in the current location.
     */
    cars: ICar[];
    /**
     * A list of roads in the current location.
     */
    roads: IRoad[];
    /**
     * A list of lots in the current location.
     */
    lots: ILot[];
    /**
     * A list of resource producing objects.
     */
    resources: IResource[];
    /**
     * A list of stockpiles. Stockpiles can store large amount of items.
     */
    stockpiles: IStockpile[];
    /**
     * A list of stockpile tiles. Adding more tiles will increase the number of slots in a stockpile.
     */
    stockpileTiles: IStockpileTile[];
    /**
     * The randomly generated ID of the current person shown.
     */
    currentPersonId: string;
    /**
     * Previous copies of networked data. Used for interpolating the drawing of networked objects. The game updates every
     * 2 seconds. We don't want to draw a position change every 2 seconds. Instead we want a smooth animation between two
     * positions from present to future using the present and previous positions.
     */
    previousNetworkObjects: {
        /**
         * A list of previous persons.
         */
        persons: IPerson[];
        /**
         * A list of previous cars.
         */
        cars: ICar[];
        /**
         * A list of previous network objects such as chairs and boxes.
         */
        objects: INetworkObject[];
        /**
         * The time of the last get that returned the previous positions.
         */
        fetchTime: Date;
    }
    /**
     * The time of the current get that returned the current positions.
     */
    fetchTime: Date;
    /**
     * The inventory to render.
     */
    vendingInventory: IVendorInventoryItem[];
    /**
     * A list of persons that are connected by voice chat.
     */
    connectedVoiceChats: string[];
    /**
     * An NPC being viewed.
     */
    npc: INpc | null;
    /**
     * A lot that is being viewed.
     */
    lot: ILot | null;
    /**
     * If the construction screen should be shown.
     */
    showConstruction: boolean;
}

/**
 * The drawables class of the [[Persons]] game.
 */
export abstract class PersonsDrawables<P extends IPersonsDrawablesProps, S extends IPersonsDrawablesState> extends React.Component<P, S> {
    /**
     * Determine if an object is inside the car.
     * @param position The object to test.
     */
    isInCar = (position: IObject) => (car: ICar): boolean => {
        switch (car.direction) {
            default:
            case ECarDirection.UP:
            case ECarDirection.DOWN:
                return position.x >= car.x - 50 && position.x <= car.x + 50 &&
                    position.y >= car.y - 100 && position.y <= car.y + 100;
            case ECarDirection.LEFT:
            case ECarDirection.RIGHT:
                return position.x >= car.x - 100 && position.x <= car.x + 100 &&
                    position.y >= car.y - 50 && position.y <= car.y + 50;
        }
    };

    /**
     * Interpolate x and y using previous position and time since last two positions to compute the current object position.
     * @param networkObject The last object position
     * @param previousNetworkObject The second last object position
     */
    interpolateObjectPosition = <T extends INetworkObjectBase>(networkObject: T, previousNetworkObject?: T): T => {
        let {x, y} = networkObject;

        if (previousNetworkObject) {
            // get previous positions
            const previousX = previousNetworkObject.x;
            const previousY = previousNetworkObject.y;
            // get time step difference in seconds
            const stepSize = (+this.state.fetchTime - +this.state.previousNetworkObjects.fetchTime) / 1000;
            const timeDiff = (+new Date() - +this.state.fetchTime) / 1000;
            // compute interpolation terms
            // size of x axis single step
            const dx = x - previousX;
            // size of y axis single step
            const dy = y - previousY;
            // position of time relative to last two positions
            const dt = timeDiff / stepSize;
            // interpolate position
            x += dx * dt;
            y += dy * dt;
        }

        return {
            ...networkObject,
            x,
            y
        };
    };

    drawHealthBar = (networkObject: INetworkObjectBase, offset?: IObject) => {
        let healthPixel = 100;
        if (networkObject.health) {
            const {value, max} = networkObject.health;
            healthPixel = Math.round(value / max * 100);
        }

        const x = offset ? offset.x : 0;
        const y = offset ? offset.y : 0;

        return (
            <g transform={`translate(${x},${y})`}>
                <polygon fill="red" points="0,-10 100,-10 100,0 0,0"/>
                <polygon fill="green" points={`0,-10 ${healthPixel},-10 ${healthPixel},0 0,0`}/>
            </g>
        );
    };

    /**
     * Select an NPC to view.
     * @param npc The NPC to view.
     */
    selectNpc = (npc: INpc) => () => {
        this.setState({
            npc
        });
    };

    /**
     * Draw a person as some SVG elements.
     * @param person The person to draw.
     * @param previousPerson The previous position used for interpolation.
     * @param isNpc The person is an NPC, NPCs are rendered differently
     */
    drawPerson = (person: IPerson, previousPerson?: IPerson, isNpc?: boolean) => {
        const {x, y} = this.interpolateObjectPosition(person, previousPerson);

        // the mask property which will mask the person's body so the bottom half of the person does not appear below a wall
        let roomMask: string = "";
        let carMask: string = "";

        // find which car the person is in
        const car = this.state.cars.find(this.isInCar(person));
        if (car) {
            // person is in a room, apply the room mask
            switch (car.direction) {
                default:
                case ECarDirection.DOWN:
                case ECarDirection.UP: {
                    carMask = `url(#car-${car.id}-down)`;
                    break;
                }
                case ECarDirection.LEFT:
                case ECarDirection.RIGHT: {
                    carMask = `url(#car-${car.id}-left)`;
                    break;
                }
            }
        }

        // if the person is connected via voice chat, useful for determining if voice chat is working or if voice chat is on
        const isConnectedByVoiceChat = this.state.connectedVoiceChats.some(id => id === person.id);

        // highlight the current person in blue
        const isCurrentPerson = person.id === this.state.currentPersonId;
        const personFilter = isCurrentPerson ? "url(#highlight-blue)" : "";

        return (
            <g key={person.id} x="0" y="0" width="500" height="300" mask={roomMask}>
                <g key={person.id} x="0" y="0" width="500" height="300" mask={carMask}>
                    <g key={person.id}
                       transform={`translate(${x - 50},${y - 200})`}
                       filter={personFilter}
                       onClick={isNpc ? this.selectNpc(person as INpc) : undefined}
                    >
                        {
                            this.drawHealthBar(person)
                        }
                        {
                            isConnectedByVoiceChat ? (
                                <>
                                    <polygon fill="white" stroke="black" strokeWidth={2} points="20,-30 20,-40 30,-40 40,-50 40,-20 30,-30"/>
                                    <path d=" M 50 -56 A 30 30 0 0 1 50 -15" fill="white" stroke="black" strokeWidth={2} />
                                    <path d=" M 65 -60 A 30 30 0 0 1 65 -10" fill="white" stroke="black" strokeWidth={2} />
                                </>
                            ) : null
                        }
                        <polygon fill="yellow" points="40,10 60,10 60,30 40,30"/>
                        <polygon fill={person.shirtColor} points="20,30 80,30 80,100 20,100"/>
                        <polygon fill={person.pantColor} points="20,100 80,100 80,120 20,120"/>
                        <polygon fill={person.pantColor} points="20,120 40,120 40,200 20,200"/>
                        <polygon fill={person.pantColor} points="80,120 60,120 60,200 80,200"/>
                    </g>
                </g>
            </g>
        );
    };

    /**
     * Draw the smoke trail behind the car.
     * @param car The car with a smoke trail
     * @param filter The filter of the car.
     */
    drawCarSmokeTrail = (car: ICar, filter: string): IDrawable[] => {
        const drawables: IDrawable[] = [];
        if (car.path) {
            const millisecondsSincePathPointStarted = (pathPoint: INpcPathPoint): number => {
                return +new Date() - Date.parse(pathPoint.time);
            };
            car.path.filter(pathPoint => millisecondsSincePathPointStarted(pathPoint) <= 10000).forEach((pathPoint, index) => {
                const {x, y} = pathPoint.location;
                const radius = 20 / 10000 * millisecondsSincePathPointStarted(pathPoint);
                drawables.push({
                    x,
                    y,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        const width = [ECarDirection.UP, ECarDirection.DOWN].includes(car.direction) ? "100" : "200";
                        const height = [ECarDirection.UP, ECarDirection.DOWN].includes(car.direction) ? "200" : "100";
                        return (
                            <g key={`car-smoke-trail-${car.id}-${index}`} x="0" y="0" width={width} height={height} filter={filter}>
                                <g key={car.id} transform={`translate(${x},${y})`}>
                                    <circle cx={0} cy={0} r={radius} fill="grey" opacity="0.3"/>
                                </g>
                            </g>
                        );
                    }
                });
            })
        }
        return drawables;
    };

    /**
     * Draw a person as some SVG elements.
     * @param car The person to draw.
     * @param previousCar The previous position used for interpolation.
     */
    drawCar = (car: ICar, previousCar?: ICar): IDrawable[] => {
        const {x, y} = this.interpolateObjectPosition(car, previousCar);

        // highlight car white when the current person is nearby
        let filter = "";
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            if (this.objectNearby(currentPerson)(car)) {
                filter = "url(#highlight-white)";
            }
        }

        // make a local copy of component, to use inside drawables
        const component = this;

        // return a list of drawable car parts
        switch (car.direction) {
            default:
            case ECarDirection.DOWN:
                return [{
                    // draw the back of the car
                    x,
                    y: y - 100,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`car-top-${car.id}`} x="0" y="0" width="100" height="200" filter={filter}>
                                <g key={car.id} transform={`translate(${x},${y})`}>
                                    <polygon fill="lightblue" points="-50,-100 50,-100 50,50, -50,50"/>
                                    <polygon fill="grey" stroke="black" strokeWidth={2}
                                             points="-40,-90 40,-90 40,50, -40,50"/>
                                    <polyline stroke="black" strokeWidth={2} points="-20,-90 -20,50"/>
                                    <polyline stroke="black" strokeWidth={2} points="0,-90 0,50"/>
                                    <polyline stroke="black" strokeWidth={2} points="20,-90 20,50"/>
                                </g>
                            </g>
                        );
                    }
                }, {
                    // draw the front of the car
                    x,
                    y,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`car-bottom-${car.id}`} x="0" y="0" width="100" height="200" filter={filter}>
                                <g key={car.id} transform={`translate(${x},${y})`}>
                                    <polygon fill="lightblue" opacity={0.5} points="-40,0 40,0 50,50 -50,50"/>
                                    <polygon fill="lightblue" points="-50,50 50,50 50,100 -50,100"/>
                                    <polygon fill="white" stroke="black" strokeWidth={2}
                                             points="-40,70 40,70 40,90 -40,90"/>
                                    <polyline stroke="black" strokeWidth={2} points="-20,70 -20,90"/>
                                    <polyline stroke="black" strokeWidth={2} points="0,70 0,90"/>
                                    <polyline stroke="black" strokeWidth={2} points="20,70 20,90"/>
                                </g>
                            </g>
                        );
                    }
                }, {
                    // draw the front of the car
                    x,
                    y,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`car-health-bar-${car.id}`} x="0" y="0" width="100" height="200" filter={filter}>
                                <g key={car.id} transform={`translate(${x},${y})`}>
                                    {
                                        component.drawHealthBar(car, {
                                            x: -50,
                                            y: -50
                                        })
                                    }
                                </g>
                            </g>
                        );
                    }
                }, ...this.drawCarSmokeTrail(car, filter)];
            case ECarDirection.UP:
                return [{
                    // draw the back of the car
                    x,
                    y: y - 100,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`car-top-${car.id}`} x="0" y="0" width="100" height="200" filter={filter}>
                                <g key={car.id} transform={`translate(${x},${y})`}>
                                    <polygon fill="lightblue" opacity={0.5} points="-40,-100 40,-100 50,-80 -50,-80"/>
                                    <polygon fill="lightblue" points="-50,-80 50,-80 50,50 -50,50"/>
                                    <polygon fill="grey" stroke="black" strokeWidth={2}
                                             points="-40,-70 40,-70 40,50 -40,50"/>
                                    <polyline stroke="black" strokeWidth={2} points="-20,-70 -20,50"/>
                                    <polyline stroke="black" strokeWidth={2} points="0,-70 0,50"/>
                                    <polyline stroke="black" strokeWidth={2} points="20,-70 20,50"/>
                                </g>
                            </g>
                        );
                    }
                }, {
                    // draw the front of the car
                    x,
                    y,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`car-bottom-${car.id}`} x="0" y="0" width="100" height="200" filter={filter}>
                                <g key={car.id} transform={`translate(${x},${y})`}>
                                    <polygon fill="lightblue" points="-50,50 50,50 50,100 -50,100"/>
                                    <polygon fill="red" stroke="black" strokeWidth={2}
                                             points="-40,60 -20,60 -20,80 -40,80"/>
                                    <polygon fill="red" stroke="black" strokeWidth={2}
                                             points="40,60 20,60 20,80 40,80"/>
                                    <polygon fill="white" stroke="black" strokeWidth={2}
                                             points="-10,60 10,60 10,80 -10,80"/>
                                </g>
                            </g>
                        );
                    }
                }, {
                    // draw the front of the car
                    x,
                    y,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`car-health-bar-${car.id}`} x="0" y="0" width="100" height="200" filter={filter}>
                                <g key={car.id} transform={`translate(${x},${y})`}>
                                    {
                                        component.drawHealthBar(car, {
                                            x: -50,
                                            y: -50
                                        })
                                    }
                                </g>
                            </g>
                        );
                    }
                }, ...this.drawCarSmokeTrail(car, filter)];
            case ECarDirection.RIGHT:
            case ECarDirection.LEFT:
                return [{
                    // draw the back of the car
                    x,
                    y: y - 50,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`car-top-${car.id}`} x="0" y="0" width="200" height="100" filter={filter}>
                                <g key={car.id}
                                   transform={`translate(${x},${y})${car.direction === ECarDirection.RIGHT ? " scale(-1,1)" : ""}`}>
                                    <polygon fill="lightblue" opacity={0.5} points="-40,-50 -40,-20 -50,-20"/>
                                    <polygon fill="lightblue" points="-50,-20 100,-20 100,25 -100,25 -100,0 -75,0"/>
                                    <polygon fill="grey" stroke="black" strokeWidth={2}
                                             points="-40,-10 90,-10 90,25 -40,25"/>
                                    <polyline stroke="black" strokeWidth={2} points="-40,10 90,10"/>
                                </g>
                            </g>
                        );
                    }
                }, {
                    // draw the front of the car
                    x,
                    y: y + 100,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`car-bottom-${car.id}`} x="0" y="0" width="200" height="100" filter={filter}>
                                <g key={car.id}
                                   transform={`translate(${x},${y})${car.direction === ECarDirection.RIGHT ? " scale(-1,1)" : ""}`}>
                                    <polygon fill="lightblue" points="-100,25 100,25 100,50 -100,50"/>
                                    <polygon fill="white" stroke="black" strokeWidth={2}
                                             points="-100,25 -80,25 -80,35 -100,35"/>
                                    <polygon fill="red" stroke="black" strokeWidth={2}
                                             points="100,25 80,25 80,35 100,35"/>
                                </g>
                            </g>
                        );
                    }
                }, {
                    // draw the front of the car
                    x,
                    y,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`car-health-bar-${car.id}`} x="0" y="0" width="100" height="200" filter={filter}>
                                <g key={car.id} transform={`translate(${x},${y})`}>
                                    {
                                        component.drawHealthBar(car, {
                                            x: -50,
                                            y: -50
                                        })
                                    }
                                </g>
                            </g>
                        );
                    }
                }, ...this.drawCarSmokeTrail(car, filter)];
        }
    };

    /**
     * Draw a table in a room.
     * @param drawable The table to draw.
     * @param filter An SVG filter to apply to the table.
     * @param previousNetworkObject The previous table position used for interpolation.
     */
    drawTable = (drawable: INetworkObject, filter: string, previousNetworkObject?: INetworkObject) => {
        const {x, y} = this.interpolateObjectPosition(drawable, previousNetworkObject);
        return (
            <g key={`table-${drawable.id}-health-bar`} transform={`translate(${x - 100},${y - 50})`} filter={filter}>
                {
                    this.drawHealthBar(drawable, {
                        x: -50,
                        y: -20
                    })
                }
                <polygon fill="brown" points="0,100 200,100 200,0 0,0"/>
            </g>
        );
    };

    /**
     * Draw a chair in a room.
     * @param drawable The chair to draw.
     * @param filter An SVG filter to apply to the chair.
     * @param previousNetworkObject The previous position of the chair used for interpolation.
     */
    drawChair = (drawable: INetworkObject, filter: string, previousNetworkObject?: INetworkObject) => {
        const {x, y} = this.interpolateObjectPosition(drawable, previousNetworkObject);
        return (
            <g key={`chair-${drawable.id}`} transform={`translate(${x - 50},${y - 50})`} filter={filter}>
                {
                    this.drawHealthBar(drawable, {
                        x: 0,
                        y: -20
                    })
                }
                <polygon fill="brown" points="10,90 20,90 20,10 10,10"/>
                <polygon fill="brown" points="80,90 90,90 90,10 80,10"/>
                <polygon fill="brown" points="40,90 60,90 60,10 40,10"/>
                <polygon fill="brown" points="10,10 90,10 90,20 10,20"/>
                <polygon fill="brown" points="10,50 90,50 90,90 10,90"/>
            </g>
        );
    };

    /**
     * Draw a box.
     * @param drawable The position of the box to draw.
     * @param filter An SVG filter to apply to the box.
     * @param previousNetworkObject The previous position of the box used for interpolation.
     */
    drawBox = (drawable: INetworkObject, filter: string, previousNetworkObject?: INetworkObject) => {
        const {x, y} = this.interpolateObjectPosition(drawable, previousNetworkObject);
        return (
            <g key={`chair-${drawable.id}`} transform={`translate(${x - 50},${y - 100})`} filter={filter}>
                {
                    this.drawHealthBar(drawable, {
                        x: 0,
                        y: -20
                    })
                }
                <polygon fill="tan" stroke="black" strokeWidth={2} points="0,0 100,0 100,100 0,100"/>
                <polygon fill="white" stroke="black" strokeWidth={2} points="30,20 60,20 60,40 30,40"/>
            </g>
        );
    };
    //
    // /**
    //  * Open the inventory of a vendor.
    //  * @param vendor The vendor to check inventory for.
    //  */
    // selectVendingOption = (vendor: IVendor) => () => {
    //     this.setState({
    //         vendingInventory: vendor.inventory
    //     });
    // };

    /**
     * Draw a vending machine.
     * @param drawable The position of the vending machine to draw.
     * @param filter An SVG filter to apply to the vending machine.
     * @param previousNetworkObject The previous position of the vending machine used for interpolation.
     */
    drawVendingMachine = (drawable: INetworkObject, filter: string, previousNetworkObject?: INetworkObject) => {
        const {x, y} = this.interpolateObjectPosition(drawable, previousNetworkObject);
        return (
            <g key={`chair-${drawable.id}`} transform={`translate(${x - 50},${y - 200})`} filter={filter}>
                <polygon fill="blue" stroke="black" strokeWidth={2} points="-50,-100 50,-100 50,100, -50,100"/>
                <polygon fill="black" points="-30,20 30,20, 30,40 -30,40"/>
                <polygon fill="white" stroke="black" strokeWidth={2} points="20,-40 40,-40 40,-30 20,-30"/>
                <polygon fill="white" stroke="black" strokeWidth={2} points="20,-20 40,-20 40,-10 20,-10"/>
                <polygon fill="white" stroke="black" strokeWidth={2} points="20,0 40,0 40,10 20,10"/>
            </g>
        );
    };

    abstract pickUpObject: (networkObject: INetworkObject) => void;
    abstract withdrawFromStockpile: (networkObject: INetworkObject, stockpile: IStockpile) => void;

    /**
     * Draw the amount tag on the item to show how many items are in the stack.
     * @param drawable The drawable item with amount information.
     */
    drawAmountTag = (drawable: INetworkObject): JSX.Element | null => {
        return (
            <g opacity={0.6}>
                <circle cx={30} cy={-5} r={10} fill="white"/>
                <text x={25} y={0} fontSize={14}>{drawable.amount}</text>
            </g>
        );
    };

    /**
     * Draw a piece of wood on the ground.
     * @param drawable The object to draw.
     * @param filter The filter to apply to the object.
     * @param previousNetworkObject The previous position of the object for interpolation.
     * @param inventory The object is in an inventory.
     * @param stockpile The stockpile the object is inside of.
     */
    drawWood = (drawable: INetworkObject, filter: string, previousNetworkObject?: INetworkObject, inventory?: boolean, stockpile?: IStockpile) => {
        const {x, y} = this.interpolateObjectPosition(drawable, previousNetworkObject);
        let onClick: undefined | (() => void);
        if (inventory && stockpile) {
            onClick = () => this.withdrawFromStockpile(drawable, stockpile);
        } else if (!inventory) {
            onClick = () => this.pickUpObject(drawable);
        }
        return (
            <g key={`wood-${drawable.id}`} transform={inventory ? "" : `translate(${x},${y})`} filter={filter} onClick={onClick}>
                <path fill="tan" stroke="black" strokeWidth={2} d="M -50 -20 c -5 -5 -5 -15 0 -20 l 50 0 c 5 5 5 15 0 20 z"/>
                <path fill="tan" stroke="black" strokeWidth={2} d="M 0 -20 c -5 -5 -5 -15 0 -20 c 5 5 5 15 0 20"/>
                <path fill="tan" stroke="black" strokeWidth={2} d="M 0 -20 c -5 -5 -5 -15 0 -20 l 50 0 c 5 5 5 15 0 20 z"/>
                <path fill="tan" stroke="black" strokeWidth={2} d="M 50 -20 c -5 -5 -5 -15 0 -20 c 5 5 5 15 0 20"/>
                <path fill="tan" stroke="black" strokeWidth={2} d="M -25 -40 c -5 -5 -5 -15 0 -20 l 50 0 c 5 5 5 15 0 20 z"/>
                <path fill="tan" stroke="black" strokeWidth={2} d="M 25 -40 c -5 -5 -5 -15 0 -20 c 5 5 5 15 0 20"/>
                {
                    inventory && stockpile ? this.drawAmountTag(drawable) : null
                }
            </g>
        )
    };

    /**
     * Draw a stick on the ground.
     * @param drawable The object to draw.
     * @param filter The filter to apply to the object.
     * @param previousNetworkObject The previous position of the object for interpolation.
     * @param inventory The object is in an inventory.
     * @param stockpile The stockpile the object is inside of.
     */
    drawStick = (drawable: INetworkObject, filter: string, previousNetworkObject?: INetworkObject, inventory?: boolean, stockpile?: IStockpile) => {
        const {x, y} = this.interpolateObjectPosition(drawable, previousNetworkObject);
        let onClick: undefined | (() => void);
        if (inventory && stockpile) {
            onClick = () => this.withdrawFromStockpile(drawable, stockpile);
        } else if (!inventory) {
            onClick = () => this.pickUpObject(drawable);
        }
        return (
            <g key={`stick-${drawable.id}`} transform={inventory ? "" : `translate(${x},${y})`} filter={filter} onClick={onClick}>
                <path fill="tan" stroke="black" strokeWidth={2} d="M -25 0 l 50 0 l 0 -5 l -50 0 z "/>
                {this.drawAmountTag(drawable)}
            </g>
        )
    };

    /**
     * Draw a piece of stone on the ground.
     * @param drawable The object to draw.
     * @param filter The filter to apply to the object.
     * @param previousNetworkObject The previous position of the object for interpolation.
     * @param inventory The object is in an inventory.
     * @param stockpile The stockpile the object is inside of.
     */
    drawStone = (drawable: INetworkObject, filter: string, previousNetworkObject?: INetworkObject, inventory?: boolean, stockpile?: IStockpile) => {
        const {x, y} = this.interpolateObjectPosition(drawable, previousNetworkObject);
        let onClick: undefined | (() => void);
        if (inventory && stockpile) {
            onClick = () => this.withdrawFromStockpile(drawable, stockpile);
        } else if (!inventory) {
            onClick = () => this.pickUpObject(drawable);
        }
        return (
            <g key={`stone-${drawable.id}`} transform={inventory ? "" : `translate(${x},${y})`} filter={filter} onClick={onClick}>
                <path fill="grey" stroke="black" strokeWidth={2} d="m -20 -15 a 20 15 0 0 0 40 0 a 20 15 0 0 0 -40 0"/>
                {
                    inventory && stockpile ? this.drawAmountTag(drawable) : null
                }
            </g>
        )
    };

    /**
     * Draw a piece of coal on the ground.
     * @param drawable The object to draw.
     * @param filter The filter to apply to the object.
     * @param previousNetworkObject The previous position of the object for interpolation.
     * @param inventory The object is in an inventory.
     * @param stockpile The stockpile the object is inside of.
     */
    drawCoal = (drawable: INetworkObject, filter: string, previousNetworkObject?: INetworkObject, inventory?: boolean, stockpile?: IStockpile) => {
        const {x, y} = this.interpolateObjectPosition(drawable, previousNetworkObject);
        let onClick: undefined | (() => void);
        if (inventory && stockpile) {
            onClick = () => this.withdrawFromStockpile(drawable, stockpile);
        } else if (!inventory) {
            onClick = () => this.pickUpObject(drawable);
        }
        return (
            <g key={`stone-${drawable.id}`} transform={inventory ? "" : `translate(${x},${y})`} filter={filter} onClick={onClick}>
                <path fill="black" stroke="black" strokeWidth={2} d="m -20 -15 a 20 15 0 0 0 40 0 a 20 15 0 0 0 -40 0"/>
                {
                    inventory && stockpile ? this.drawAmountTag(drawable) : null
                }
            </g>
        )
    };

    /**
     * Draw a piece of iron on the ground.
     * @param drawable The object to draw.
     * @param filter The filter to apply to the object.
     * @param previousNetworkObject The previous position of the object for interpolation.
     * @param inventory The object is in an inventory.
     * @param stockpile The stockpile the object is inside of.
     */
    drawIron = (drawable: INetworkObject, filter: string, previousNetworkObject?: INetworkObject, inventory?: boolean, stockpile?: IStockpile) => {
        const {x, y} = this.interpolateObjectPosition(drawable, previousNetworkObject);
        let onClick: undefined | (() => void);
        if (inventory && stockpile) {
            onClick = () => this.withdrawFromStockpile(drawable, stockpile);
        } else if (!inventory) {
            onClick = () => this.pickUpObject(drawable);
        }
        return (
            <g key={`stone-${drawable.id}`} transform={inventory ? "" : `translate(${x},${y})`} filter={filter} onClick={onClick}>
                <path fill="maroon" stroke="black" strokeWidth={2} d="m -20 -15 a 20 15 0 0 0 40 0 a 20 15 0 0 0 -40 0"/>
                {
                    inventory && stockpile ? this.drawAmountTag(drawable) : null
                }
            </g>
        )
    };

    /**
     * Draw a piece of mud on the ground.
     * @param drawable The object to draw.
     * @param filter The filter to apply to the object.
     * @param previousNetworkObject The previous position of the object for interpolation.
     * @param inventory The object is in an inventory.
     * @param stockpile The stockpile the object is inside of.
     */
    drawMud = (drawable: INetworkObject, filter: string, previousNetworkObject?: INetworkObject, inventory?: boolean, stockpile?: IStockpile) => {
        const {x, y} = this.interpolateObjectPosition(drawable, previousNetworkObject);
        let onClick: undefined | (() => void);
        if (inventory && stockpile) {
            onClick = () => this.withdrawFromStockpile(drawable, stockpile);
        } else if (!inventory) {
            onClick = () => this.pickUpObject(drawable);
        }
        return (
            <g key={`stone-${drawable.id}`} transform={inventory ? "" : `translate(${x},${y})`} filter={filter} onClick={onClick}>
                <path fill="brown" stroke="black" strokeWidth={2} d="m -20 -15 a 20 15 0 0 0 40 0 a 20 15 0 0 0 -40 0"/>
                {
                    inventory && stockpile ? this.drawAmountTag(drawable) : null
                }
            </g>
        )
    };

    /**
     * Draw a piece of clay on the ground.
     * @param drawable The object to draw.
     * @param filter The filter to apply to the object.
     * @param previousNetworkObject The previous position of the object for interpolation.
     * @param inventory The object is in an inventory.
     * @param stockpile The stockpile the object is inside of.
     */
    drawClay = (drawable: INetworkObject, filter: string, previousNetworkObject?: INetworkObject, inventory?: boolean, stockpile?: IStockpile) => {
        const {x, y} = this.interpolateObjectPosition(drawable, previousNetworkObject);
        let onClick: undefined | (() => void);
        if (inventory && stockpile) {
            onClick = () => this.withdrawFromStockpile(drawable, stockpile);
        } else if (!inventory) {
            onClick = () => this.pickUpObject(drawable);
        }
        return (
            <g key={`stone-${drawable.id}`} transform={inventory ? "" : `translate(${x},${y})`} filter={filter} onClick={onClick}>
                <path fill="grey" stroke="black" strokeWidth={2} d="m -20 -15 a 20 15 0 0 0 40 0 a 20 15 0 0 0 -40 0"/>
                {
                    inventory && stockpile ? this.drawAmountTag(drawable) : null
                }
            </g>
        )
    };

    /**
     * Draw a reed on the ground.
     * @param drawable The object to draw.
     * @param filter The filter to apply to the object.
     * @param previousNetworkObject The previous position of the object for interpolation.
     * @param inventory The object is in an inventory.
     * @param stockpile The stockpile the object is inside of.
     */
    drawReed = (drawable: INetworkObject, filter: string, previousNetworkObject?: INetworkObject, inventory?: boolean, stockpile?: IStockpile) => {
        const {x, y} = this.interpolateObjectPosition(drawable, previousNetworkObject);
        let onClick: undefined | (() => void);
        if (inventory && stockpile) {
            onClick = () => this.withdrawFromStockpile(drawable, stockpile);
        } else if (!inventory) {
            onClick = () => this.pickUpObject(drawable);
        }
        return (
            <g key={`stick-${drawable.id}`} transform={inventory ? "" : `translate(${x},${y})`} filter={filter} onClick={onClick}>
                <path fill="green" stroke="black" strokeWidth={2} d="M -25 0 l 50 0 l 0 -5 l -50 0 z "/>
                <text x={-25} y={-30} fontSize={14}>{drawable.amount}</text>
                {this.drawAmountTag(drawable)}
            </g>
        )
    };

    /**
     * Draw a wattle wall on the ground.
     * @param drawable The object to draw.
     * @param filter The filter to apply to the object.
     * @param previousNetworkObject The previous position of the object for interpolation.
     * @param inventory The object is in an inventory.
     * @param stockpile The stockpile the object is inside of.
     */
    drawWattleWall = (drawable: INetworkObject, filter: string, previousNetworkObject?: INetworkObject, inventory?: boolean, stockpile?: IStockpile) => {
        const {x, y} = this.interpolateObjectPosition(drawable, previousNetworkObject);
        let onClick: undefined | (() => void);
        if (inventory && stockpile) {
            onClick = () => this.withdrawFromStockpile(drawable, stockpile);
        } else if (!inventory) {
            onClick = () => this.pickUpObject(drawable);
        }
        return (
            <g key={`stone-${drawable.id}`} transform={inventory ? "" : `translate(${x},${y})`} filter={filter} onClick={onClick}>
                <rect x={-28} y={-56} width={56} height={56} fill="url(#wattle)"/>
                {this.drawAmountTag(drawable)}
            </g>
        )
    };

    /**
     * Draw a networked object onto the screen.
     * @param networkObject The network object to draw.
     * @param previousNetworkObject The previous network object used for interpolation.
     * @param inventory The image is in an inventory, not in the world.
     * @param stockpile The stockpile the item is inside of.
     */
    drawNetworkObject = (networkObject: INetworkObject, previousNetworkObject?: INetworkObject, inventory?: boolean, stockpile?: IStockpile): IDrawable => {
        const component = this;

        // highlight objects near current person with a white outline
        let filter = "";
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            if (this.objectNearby(currentPerson)(networkObject)) {
                filter = "url(#highlight-white)";
            }
        }

        // highlight objects grabbed by current person with a blue outline
        if (currentPerson && networkObject.grabbedByPersonId === currentPerson.id) {
            filter = "url(#highlight-blue)";
        }

        switch (networkObject.objectType) {
            case ENetworkObjectType.CHAIR: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawChair(networkObject, filter, previousNetworkObject);
                    }
                };
            }
            case ENetworkObjectType.TABLE: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawTable(networkObject, filter, previousNetworkObject);
                    }
                };
            }
            case ENetworkObjectType.VENDING_MACHINE: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawVendingMachine(networkObject, filter, previousNetworkObject);
                    }
                };
            }
            case ENetworkObjectType.WOOD: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawWood(networkObject, filter, previousNetworkObject, inventory, stockpile);
                    }
                }
            }
            case ENetworkObjectType.STICK: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawStick(networkObject, filter, previousNetworkObject, inventory, stockpile);
                    }
                }
            }
            case ENetworkObjectType.STONE: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawStone(networkObject, filter, previousNetworkObject, inventory, stockpile);
                    }
                }
            }
            case ENetworkObjectType.COAL: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawCoal(networkObject, filter, previousNetworkObject, inventory, stockpile);
                    }
                }
            }
            case ENetworkObjectType.IRON: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawIron(networkObject, filter, previousNetworkObject, inventory, stockpile);
                    }
                }
            }
            case ENetworkObjectType.MUD: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawMud(networkObject, filter, previousNetworkObject, inventory, stockpile);
                    }
                }
            }
            case ENetworkObjectType.CLAY: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawClay(networkObject, filter, previousNetworkObject, inventory, stockpile);
                    }
                }
            }
            case ENetworkObjectType.REED: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawReed(networkObject, filter, previousNetworkObject, inventory, stockpile);
                    }
                }
            }
            case ENetworkObjectType.WATTLE_WALL: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawWattleWall(networkObject, filter, previousNetworkObject, inventory, stockpile);
                    }
                }
            }
            default:
            case ENetworkObjectType.BOX: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawBox(networkObject, filter, previousNetworkObject);
                    }
                };
            }
        }
    };

    /**
     * A function to harvest some resource.
     */
    abstract harvestResource: (resource: IResource) => void;

    /**
     * Draw a tree.
     * @param tree The tree data to draw.
     */
    drawTree = (tree: ITree): IDrawable[] => {
        const {x, y} = tree;

        const component = this;
        const rng: seedrandom.prng = seedrandom.alea(tree.treeSeed);

        if (tree.depleted) {
            return [{
                x,
                y,
                type: EDrawableType.OBJECT,
                draw() {
                    return (
                        <g key={tree.id} transform={`translate(${x},${y})`}>
                            <polygon stroke="black" strokeWidth={2} fill="tan" points="-25,0 -20,-5 -15,-15 -15,-30 15,-30 15,-15 20,-5 25,0"/>
                        </g>
                    );
                }
            }]
        } else {
            // render leaves in random positions using a seeded random number generator
            const numberOfLeaves = Math.floor(rng.quick() * 20) + 5;
            const leaves = new Array(numberOfLeaves).fill(0).map((v, i): ITreeLeaf => ({
                id: `leaves-${i}`,
                x: Math.floor(rng.quick() * 80) - 50,
                y: -Math.floor(rng.quick() * 50) - 100
            })).reduce((arr: ITreeLeaf[], leaf: ITreeLeaf): ITreeLeaf[] => {
                if (arr.every((l) => Math.sqrt(Math.pow(leaf.x - l.x, 2) + Math.pow(leaf.y - l.y, 2)) >= 15)) {
                    return [...arr, leaf];
                } else {
                    return arr;
                }
            }, []);

            return [{
                x,
                y,
                type: EDrawableType.OBJECT,
                draw() {
                    return (
                        <g key={tree.id} transform={`translate(${x},${y})`} onClick={() => component.harvestResource(tree)}>
                            <polygon stroke="black" strokeWidth={2} fill="tan" points="-25,0 -20,-5 -15,-15 -15,-110 15,-110 15,-15 20,-5 25,0"/>
                            <path stroke="black" strokeWidth={2} fill="green" d="M -50 -100 c 25 -100 75 -100 100 0 z "/>
                            {
                                leaves.map(leaf => {
                                    return (
                                        <path key={leaf.id} stroke="black" strokeWidth={2} fill="green" d={`M ${leaf.x} ${leaf.y} c 5 -20 15 -20 20 0 z `}/>
                                    );
                                })
                            }
                        </g>
                    );
                }
            }];
        }
    };

    /**
     * Draw a tree.
     * @param rock The tree data to draw.
     */
    drawRock = (rock: IResource): IDrawable[] => {
        const {x, y} = rock;

        const component = this;

        if (rock.depleted) {
            return [{
                x,
                y,
                type: EDrawableType.OBJECT,
                draw() {
                    return (
                        <g key={rock.id} transform={`translate(${x},${y})`}>
                            <path stroke="black" strokeWidth={2} fill="darkgrey" d="m -50 0 c 0 -50 50 -25 50 0 c 0 -25 50 -50 50 0 z"/>
                            <path stroke="black" strokeWidth={2} fill="darkgrey" d="m -25 0 c 0 -50 50 -75 50 0 z"/>
                        </g>
                    );
                }
            }]
        } else {
            return [{
                x,
                y,
                type: EDrawableType.OBJECT,
                draw() {
                    return (
                        <g key={rock.id} transform={`translate(${x},${y})`} onClick={() => component.harvestResource(rock)}>
                            <path stroke="black" strokeWidth={2} fill="grey" d="m -50 0 c 0 -75 50 -25 50 0 c 0 -50 50 -75 50 0 z"/>
                            <path stroke="black" strokeWidth={2} fill="grey" d="m -25 0 c 0 -75 50 -75 50 0 z"/>
                        </g>
                    );
                }
            }];
        }
    };

    /**
     * Draw a pond.
     * @param pond The pond data to draw.
     */
    drawPond = (pond: IResource): IDrawable[] => {
        const {x, y} = pond;

        const component = this;

        if (pond.depleted) {
            return [{
                x,
                y,
                type: EDrawableType.OBJECT,
                draw() {
                    return (
                        <g key={pond.id} transform={`translate(${x},${y})`}>
                            <path stroke="black" strokeWidth={2} fill="blue" d="m -50 0 c 0 40 60 20 100 0 c 30 -16 20 -50 0 -40 c -24 10 -58 2 -60 0 c -36 -20 -40 0 -40 40"/>
                        </g>
                    );
                }
            }]
        } else {
            return [{
                x,
                y,
                type: EDrawableType.OBJECT,
                draw() {
                    return (
                        <g key={pond.id} transform={`translate(${x},${y})`} onClick={() => component.harvestResource(pond)}>
                            <path stroke="black" strokeWidth={2} fill="cyan" d="m -50 0 c 0 40 60 20 100 0 c 30 -16 20 -50 0 -40 c -24 10 -58 2 -60 0 c -36 -20 -40 0 -40 40"/>
                        </g>
                    );
                }
            }];
        }
    };

    /**
     * Draw resource objects which can generate resources.
     * @param resource The resource to draw.
     */
    drawResource = (resource: IResource): IDrawable[] => {
        switch (resource.objectType) {
            case ENetworkObjectType.TREE: {
                return this.drawTree(resource as ITree);
            }
            case ENetworkObjectType.ROCK: {
                return this.drawRock(resource);
            }
            case ENetworkObjectType.POND: {
                return this.drawPond(resource);
            }
            default: {
                return [];
            }
        }
    };

    /**
     * Function to handle constructing, (building or destroying building parts).
     */
    abstract constructAtLocation(location: IObject): void;
    /**
     * Map from floor type to pattern.
     */
    floorPatterns: {[key: string]: string} = {
        [EFloorPattern.DIRT]: "url(#dirt)"
    };
    defaultFloorPattern: string = "url(#grass)";
    /**
     * Draw a floor tile.
     * @param floor The floor to draw.
     */
    drawFloor = (floor: IFloor) => {
        const {x, y} = floor;
        const drawables = [] as IDrawable[];

        const fill = this.floorPatterns[floor.floorPattern] || this.defaultFloorPattern;
        const component = this;
        drawables.push({
            x,
            y,
            type: EDrawableType.OBJECT,
            draw(this: IDrawable) {
                return (
                    <g key={`floor-${floor.id}`} transform={`translate(${x},${y})`}>
                        <rect x={0} y={0} width={200} height={200} fill={fill}/>
                        {
                            component.state.showConstruction ?
                                <rect x="20" y="20" width={160} height={160} fill="grey" fillOpacity={0.3} onClick={() => component.constructAtLocation(floor)}/> :
                                null
                        }
                    </g>
                );
            }
        });

        return drawables;
    };

    wallPatterns: {[key: string]: string} = {
        [EWallPattern.WATTLE]: "url(#wattle)"
    };
    defaultWallPattern: string = "url(#wattle)";
    /**
     * Draw a wall tile.
     * @param wall The wall to draw.
     */
    drawWall = (wall: IWall) => {
        const {x, y} = wall;
        const drawables = [] as IDrawable[];

        // do not draw wall if current person is nearby
        const currentPerson = this.getCurrentPerson();
        const personIsNearby = currentPerson && currentPerson.x >= wall.x && currentPerson.x <= wall.x + 200 &&
            currentPerson.y <= wall.y && currentPerson.y >= wall.y - 200;
        if (!personIsNearby && !this.state.showConstruction) {
            const fill = this.wallPatterns[wall.wallPattern] || this.defaultWallPattern;
            switch (wall.direction) {
                case EWallDirection.HORIZONTAL: {
                    drawables.push({
                        x,
                        y,
                        type: EDrawableType.OBJECT,
                        draw(this: IDrawable) {
                            return (
                                <g key={`wall-${wall.id}`} transform={`translate(${x},${y})`}>
                                    <rect x="0" y={-200} width={200} height={200} fill={fill}/>
                                </g>
                            );
                        }
                    });
                    break;
                }
                case EWallDirection.VERTICAL: {
                    drawables.push({
                        x,
                        y,
                        type: EDrawableType.OBJECT,
                        draw(this: IDrawable) {
                            return (
                                <g key={`floor-${wall.id}`} transform={`translate(${x},${y})`}>
                                    <rect x="0" y="-8" width={16} height={200} fill={fill}/>
                                </g>
                            );
                        }
                    });
                    break;
                }
            }
        }

        return drawables;
    };

    /**
     * Draw the roads on the svg world.
     */
    drawRoads = (worldOffset: IObject) => {
        return this.state.roads.filter(this.isNearWorldView(worldOffset)).map(({connected, direction, x, y}) => {
            switch (direction) {
                case ERoadDirection.HORIZONTAL: {
                    return (
                        <g key={`road-tile-${x}-${y}`} transform={`translate(${x}, ${y})`}>
                            <rect x="0" y="0" width="500" height="300" fill="url(#road)"/>
                            <rect x="0" y="135" width="500" height="10" fill="url(#road-yellow)"/>
                            <rect x="0" y="155" width="500" height="10" fill="url(#road-yellow)"/>
                            <rect x="0" y="0" width="500" height="10" fill="url(#road-white)"/>
                            <rect x="0" y="290" width="500" height="10" fill="url(#road-white)"/>
                        </g>
                    );
                }
                case ERoadDirection.VERTICAL: {
                    return (
                        <g key={`road-tile-${x}-${y}`} transform={`translate(${x}, ${y})`}>
                            <rect x="100" y="0" width="300" height="300" fill="url(#road)"/>
                            {
                                // if not connected left and right, draw yellow line in the middle
                                !connected.left && !connected.right ? (
                                        <>
                                            <rect x="235" y="0" width="10" height="300" fill="url(#road-yellow)"/>
                                            <rect x="255" y="0" width="10" height="300" fill="url(#road-yellow)"/>
                                        </>
                                    ) :
                                    null
                            }
                            {
                                // draw left connection of road if connected on left side
                                connected.left ? (
                                    <>
                                        <rect x="0" y="0" width="100" height="300" fill="url(#road)"/>
                                        <rect x="0" y="0" width="100" height="10" fill="url(#road-white)"/>
                                        <rect x="0" y="290" width="100" height="10" fill="url(#road-white)"/>
                                        <rect x="0" y="135" width="100" height="10" fill="url(#road-yellow)"/>
                                        <rect x="0" y="155" width="100" height="10" fill="url(#road-yellow)"/>
                                    </>
                                ) : null
                            }
                            {
                                // draw right section of road if connected on the right side
                                connected.right ? (
                                    <>
                                        <rect x="400" y="0" width="100" height="300" fill="url(#road)"/>
                                        <rect x="400" y="0" width="100" height="10" fill="url(#road-white)"/>
                                        <rect x="400" y="290" width="100" height="10" fill="url(#road-white)"/>
                                        <rect x="400" y="135" width="100" height="10" fill="url(#road-yellow)"/>
                                        <rect x="400" y="155" width="100" height="10" fill="url(#road-yellow)"/>
                                    </>
                                ) : null
                            }
                            {
                                // draw left white line if no connection
                                !connected.left ? (
                                    <rect x="100" y="0" width="10" height="300" fill="url(#road-white)"/>
                                ) : null
                            }
                            {
                                // draw right white line if no connection
                                !connected.right ? (
                                    <rect x="390" y="0" width="10" height="300" fill="url(#road-white)"/>
                                ) : null
                            }
                            {
                                // draw top white line if no connection
                                !connected.up ? (
                                    <rect x="100" y="0" width="300" height="10" fill="url(#road-white)"/>
                                ) : null
                            }
                            {
                                // draw bottom white line if no connection
                                !connected.down ? (
                                    <rect x="100" y="290" width="300" height="10" fill="url(#road-white)"/>
                                ) : null
                            }
                            {

                                // draw top left corner
                                !connected.up && !connected.left && connected.down && connected.right ? (
                                    <g>
                                        <rect x="245" y="135" width="155" height="10" fill="url(#road-yellow)"/>
                                        <rect x="255" y="155" width="145" height="10" fill="url(#road-yellow)"/>
                                        <rect x="235" y="135" width="10" height="165" fill="url(#road-yellow)"/>
                                        <rect x="255" y="155" width="10" height="150" fill="url(#road-yellow)"/>
                                        <rect x="390" y="290" width="10" height="10" fill="url(#road-white)"/>
                                    </g>
                                ) : null
                            }
                            {
                                // draw bottom left corner
                                connected.up && !connected.left && !connected.down && connected.right ? (
                                    <g>
                                        <rect x="255" y="135" width="150" height="10" fill="url(#road-yellow)"/>
                                        <rect x="245" y="155" width="165" height="10" fill="url(#road-yellow)"/>
                                        <rect x="235" y="0" width="10" height="165" fill="url(#road-yellow)"/>
                                        <rect x="255" y="0" width="10" height="145" fill="url(#road-yellow)"/>
                                        <rect x="390" y="0" width="10" height="10" fill="url(#road-white)"/>
                                    </g>
                                ) : null
                            }
                            {
                                // draw bottom right corner
                                connected.up && connected.left && !connected.down && !connected.right ? (
                                    <g>
                                        <rect x="100" y="135" width="145" height="10" fill="url(#road-yellow)"/>
                                        <rect x="100" y="155" width="165" height="10" fill="url(#road-yellow)"/>
                                        <rect x="235" y="0" width="10" height="145" fill="url(#road-yellow)"/>
                                        <rect x="255" y="0" width="10" height="155" fill="url(#road-yellow)"/>
                                        <rect x="100" y="0" width="10" height="10" fill="url(#road-white)"/>
                                    </g>
                                ) : null
                            }
                            {
                                // draw top right corner
                                !connected.up && connected.left && connected.down && !connected.right ? (
                                    <g>
                                        <rect x="100" y="135" width="165" height="10" fill="url(#road-yellow)"/>
                                        <rect x="100" y="155" width="145" height="10" fill="url(#road-yellow)"/>
                                        <rect x="255" y="135" width="10" height="165" fill="url(#road-yellow)"/>
                                        <rect x="235" y="155" width="10" height="145" fill="url(#road-yellow)"/>
                                        <rect x="100" y="0" width="10" height="10" fill="url(#road-white)"/>
                                    </g>
                                ) : null
                            }
                            {
                                // draw bottom right corner box
                                connected.down && connected.right ? (
                                    <g>
                                        <rect x="390" y="290" width="10" height="10" fill="url(#road-white)"/>
                                    </g>
                                ) : null
                            }
                            {
                                // draw top right corner box
                                connected.up && connected.right ? (
                                    <g>
                                        <rect x="390" y="0" width="10" height="10" fill="url(#road-white)"/>
                                    </g>
                                ) : null
                            }
                            {
                                // draw top left corner box
                                connected.up && connected.left ? (
                                    <g>
                                        <rect x="100" y="0" width="10" height="10" fill="url(#road-white)"/>
                                    </g>
                                ) : null
                            }
                            {
                                // draw bottom left corner box
                                connected.down && connected.left ? (
                                    <g>
                                        <rect x="100" y="290" width="10" height="10" fill="url(#road-white)"/>
                                    </g>
                                ) : null
                            }
                        </g>
                    );
                }
                default: return null;
            }
        })
    };

    /**
     * Interpolate path data onto the npc position.
     * @param npc The npc with path data.
     */
    applyPathToNpc = (npc: INpc): INpc => {
        // get the current time, used to interpolate the npc
        const now = new Date();

        // determine if there is path data
        const firstPoint = npc.path[0];
        if (firstPoint && +now > Date.parse(firstPoint.time)) {
            // there is path information and the path started

            // a path is made of an array of points. We want to interpolate two points forming a line segment.
            // find point b in array of points, it's the second point
            const indexOfPointB = npc.path.findIndex(p => Date.parse(p.time) > +now);
            if (indexOfPointB >= 0) {
                // not past last path yet, interpolate point a to point b
                const a = npc.path[indexOfPointB - 1];
                const b = npc.path[indexOfPointB];
                if (a && b) {
                    const pointA = a.location;
                    const pointB = b.location;
                    const timeA = Date.parse(a.time);
                    const timeB = Date.parse(b.time);

                    const dx = pointB.x - pointA.x;
                    const dy = pointB.y - pointA.y;
                    const dt = timeB - timeA;
                    const t = (+now - timeA) / dt;
                    const x = pointA.x + dx * t;
                    const y = pointA.y + dy * t;

                    return {
                        ...npc,
                        x,
                        y
                    };
                } else {
                    // missing points a and b
                    return npc;
                }
            } else {
                // past last point, path data is over
                const lastPoint = npc.path[npc.path.length - 1];
                if (lastPoint) {
                    // draw npc at last location
                    const {x, y} = lastPoint.location;
                    return {
                        ...npc,
                        x,
                        y
                    };
                } else {
                    // cannot find last location, return original npc
                    return npc;
                }
            }
        } else {
            // no path information, return original npc
            return npc;
        }
    };

    /**
     * Interpolate the resource state across time. The data will store a time in the future that the resource will respawn
     * without actually changing the data. Instead the depleted state must be interpolated to draw the resource correctly.
     * @param resource The resource with state that should be interpolated.
     */
    interpolateResource = (resource: IResource): IResource => {
        if (resource.depleted) {
            return {
                ...resource,
                depleted: +new Date() < Date.parse(resource.readyTime)
            };
        } else {
            return resource;
        }
    };

    /**
     * Create a sorted list of all drawable objects for final rendering. Objects at the bottom should overlap objects
     * above them to create a 2D Stereographic Projection, like a 2D with 3D movement arcade game. Sort [[IDrawable]]s
     * from top to bottom so bottom is drawn last, on top of the [[IDrawable]] above it.
     */
    sortDrawables = (worldOffset: IObject): IDrawable[] => {
        const component = this;
        const currentPerson = this.getCurrentPerson();
        const drawables = [
            // add all persons
            ...this.state.persons.filter(this.isNearWorldView(worldOffset)).map(person => ({
                draw(this: IDrawable) {
                    const previousPerson = component.state.previousNetworkObjects.persons.find(p => {
                        return p.id === person.id && person.id !== component.state.currentPersonId;
                    });
                    return component.drawPerson(person, previousPerson);
                },
                type: EDrawableType.PERSON,
                ...person
            })),

            // add all npcs
            ...this.state.npcs.map(this.applyPathToNpc).filter(this.isNearWorldView(worldOffset)).map(npc => ({
                draw(this: IDrawable) {
                    return component.drawPerson(npc, undefined, true);
                },
                type: EDrawableType.PERSON,
                ...npc
            })),

            // for each network object
            ...this.state.objects.map(obj => applyStateToNetworkObject(obj)).filter(obj => obj.exist).filter(this.isNearWorldView(worldOffset)).reduce((arr: IDrawable[], networkObject: INetworkObject): IDrawable[] => {
                const previousNetworkObject = component.state.previousNetworkObjects.objects.find(p => {
                    return p.id === networkObject.id && networkObject.grabbedByPersonId !== component.state.currentPersonId;
                });
                return [
                    ...arr,
                    this.drawNetworkObject(networkObject, previousNetworkObject)
                ];
            }, []),

            // for each resource object
            ...this.state.resources.map(resource => applyStateToResource(resource)).filter(this.isNearWorldView(worldOffset)).map(this.interpolateResource).reduce((arr: IDrawable[], resource: IResource): IDrawable[] => {
                return [
                    ...arr,
                    ...this.drawResource(resource)
                ];
            }, []),

            // for each floor
            ...this.state.floors.filter(this.isNearWorldView(worldOffset)).reduce((arr: IDrawable[], floor: IFloor): IDrawable[] => {
                return [
                    ...arr,

                    // add all floors
                    ...component.drawFloor(floor)
                ];
            }, []),

            // for each wall
            ...this.state.walls.filter(this.isNearWorldView(worldOffset)).reduce((arr: IDrawable[], wall: IWall): IDrawable[] => {
                return [
                    ...arr,

                    // add all floors
                    ...component.drawWall(wall)
                ];
            }, []),

            // for each car
            ...this.state.cars.filter(this.isNearWorldView(worldOffset)).reduce((arr: IDrawable[], car: ICar): IDrawable[] => {
                const previousCar = component.state.previousNetworkObjects.cars.find(c => {
                    return c.id === car.id && car.id && !(currentPerson && car.id === currentPerson.carId);
                });
                return [
                    ...arr,

                    // add all car parts
                    ...component.drawCar(car, previousCar)
                ];
            }, [])
        ];

        // sort drawable objects from top to bottom
        return drawables.sort((a, b) => {
            // by default, sort by height difference
            // sort by height differences
            return a.y - b.y;
        }).filter((a) => {
            if (a.type === EDrawableType.WALL) {
                // check if the wall is near the current person horizontally
                if (a.x >= worldOffset.x && a.x <= worldOffset.x + 500) {
                    // remove walls that are below current person
                    return a.y <= worldOffset.y + (this.state.height / 2);
                } else {
                    return true;
                }
            } else {
                // keep other drawables that are not walls
                return true;
            }
        });
    };

    /**
     * Find the current person in the game state.
     */
    getCurrentPerson = (): IPerson | undefined => {
        return this.state.persons.find(person => person.id === this.state.currentPersonId);
    };

    /**
     * Determine if a network object is nearby the person.
     * @param person The person which could be nearby the object.
     */
    objectNearby = (person: IPerson) => (object: INetworkObjectBase) => {
        return Math.abs(object.x - person.x) <= 100 && Math.abs(object.y - person.y) <= 100;
    };

    /**
     * Determine if the object is near the world view.
     * @param offset The world view to test.
     */
    isNearWorldView = (offset: IObject) => (object: IObject): boolean => {
        if ((object as INetworkObject).isInInventory) {
            return false;
        } else {
            return Math.abs(object.x - offset.x) <= this.state.width * 2 && Math.abs(object.y - offset.y) <= this.state.height * 2;
        }
    };

    /**
     * Generate a random Person Id to control a specific person on the server.
     */
    randomPersonId() {
        return new Array(10).fill(0).map(() => Number(Math.floor(Math.random() * 36)).toString(36)).join("");
    }

    /**
     * Generate the SVG DEFs for car masks.
     */
    generateCarMasks = () => {
        return this.state.cars.map((car: ICar) => {
            const {x, y} = car;
            return (
                <>
                    <mask key={`car-${car.id}-down`} id={`car-${car.id}-down`} x="0" y="0" width="100" height="200">
                        <rect fill="white" x={x - 50} y={y - 200} width={100} height={250}/>
                        <rect fill="white" x={x - 100} y={y - 200} width={50} height={400}/>
                        <rect fill="white" x={x + 50} y={y - 200} width={50} height={400}/>
                    </mask>
                    <mask key={`car-${car.id}-left`} id={`car-${car.id}-left`} x="0" y="0" width="200" height="100">
                        <rect fill="white" x={x - 100} y={y - 200} width={200} height={250}/>
                        <rect fill="white" x={x - 150} y={y - 200} width={50} height={400}/>
                        <rect fill="white" x={x + 100} y={y - 200} width={50} height={400}/>
                    </mask>
                </>
            );
        });
    };
}