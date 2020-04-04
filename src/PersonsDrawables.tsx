import {
    ECarDirection,
    EDrawableType,
    ENetworkObjectType,
    ERoomWallType,
    ICar,
    IDrawable,
    ILot,
    INetworkObject,
    IObject,
    IPerson,
    IRoad,
    IRoom
} from "./types/GameTypes";
import React from "react";

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
     * A list of objects in the area.
     */
    objects: INetworkObject[];
    /**
     * A list of rooms in the current building.
     */
    rooms: IRoom[];
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
     * The randomly generated ID of the current person shown.
     */
    currentPersonId: string;
}

/**
 * The drawables class of the [[Persons]] game.
 */
export abstract class PersonsDrawables<P extends IPersonsDrawablesProps, S extends IPersonsDrawablesState> extends React.Component<P, S> {

    /**
     * Determine if an object is inside the room.
     * @param position The object to test.
     */
    isInRoom = (position: IObject) => (room: IRoom): boolean => {
        return position.x >= room.x && position.x <= room.x + 500 &&
            position.y >= room.y && position.y <= room.y + 300;
    };

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
     * Draw a person as some SVG elements.
     * @param person The person to draw.
     */
    drawPerson = (person: IPerson) => {
        const {x, y} = person;

        // the mask property which will mask the person's body so the bottom half of the person does not appear below a wall
        let roomMask: string = "";
        let carMask: string = "";

        // find which room the person is in
        const roomIndex = this.state.rooms.findIndex(this.isInRoom(person));
        if (roomIndex >= 0) {
            // person is in a room, apply the room mask
            roomMask = `url(#room-${roomIndex})`;
        }

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

        return (
            <g key={person.id} x="0" y="0" width="500" height="300" mask={roomMask}>
                <g key={person.id} x="0" y="0" width="500" height="300" mask={carMask}>
                    <g key={person.id} transform={`translate(${x - 50},${y - 100})`}>
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
     * Draw a person as some SVG elements.
     * @param car The person to draw.
     */
    drawCar = (car: ICar): IDrawable[] => {
        const {x, y} = car;

        // the mask property which will mask the car so the bottom half of the car does not appear below a wall
        let mask: string = "";
        // find which room the car is in
        const roomIndex = this.state.rooms.findIndex(this.isInRoom(car));
        if (roomIndex >= 0) {
            // car is in a room, apply the room mask
            mask = `url(#room-${roomIndex})`;
        }

        // highlight car white when the current person is nearby
        let filter = "";
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            if (this.objectNearby(currentPerson)(car)) {
                filter = "url(#highlight-white)";
            }
        }

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
                            <g key={`car-top-${car.id}`} x="0" y="0" width="100" height="200" mask={mask} filter={filter}>
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
                            <g key={`car-bottom-${car.id}`} x="0" y="0" width="100" height="200" mask={mask} filter={filter}>
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
                }];
            case ECarDirection.UP:
                return [{
                    // draw the back of the car
                    x,
                    y: y - 100,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`car-top-${car.id}`} x="0" y="0" width="100" height="200" mask={mask} filter={filter}>
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
                            <g key={`car-bottom-${car.id}`} x="0" y="0" width="100" height="200" mask={mask} filter={filter}>
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
                }];
            case ECarDirection.RIGHT:
            case ECarDirection.LEFT:
                return [{
                    // draw the back of the car
                    x,
                    y: y - 50,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`car-top-${car.id}`} x="0" y="0" width="200" height="100" mask={mask} filter={filter}>
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
                            <g key={`car-bottom-${car.id}`} x="0" y="0" width="200" height="100" mask={mask} filter={filter}>
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
                }];
        }
    };

    /**
     * Draw a table in a room.
     * @param drawable The table to draw.
     * @param filter An SVG filter to apply to the table.
     */
    drawTable = (drawable: INetworkObject, filter: string) => {
        const {x, y} = drawable;
        return (
            <g key={`table-${drawable.id}`} transform={`translate(${x - 100},${y - 50})`} filter={filter}>
                <polygon fill="brown" points="0,100 200,100 200,0 0,0"/>
            </g>
        );
    };

    /**
     * Draw a chair in a room.
     * @param drawable The chair to draw.
     * @param filter An SVG filter to apply to the chair.
     */
    drawChair = (drawable: INetworkObject, filter: string) => {
        const {x, y} = drawable;
        return (
            <g key={`chair-${drawable.id}`} transform={`translate(${x - 50},${y - 50})`} filter={filter}>
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
     */
    drawBox = (drawable: INetworkObject, filter: string) => {
        const {x, y} = drawable;
        return (
            <g key={`chair-${drawable.id}`} transform={`translate(${x - 50},${y - 50})`} filter={filter}>
                <polygon fill="tan" stroke="black" strokeWidth={2} points="0,0 100,0 100,100 0,100"/>
                <polygon fill="white" stroke="black" strokeWidth={2} points="30,20 60,20 60,40 30,40"/>
            </g>
        );
    };

    /**
     * Draw a networked object onto the screen.
     * @param networkObject The network object to draw.
     */
    drawNetworkObject = (networkObject: INetworkObject): IDrawable => {
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
                        return component.drawChair(networkObject, filter);
                    }
                };
            }
            case ENetworkObjectType.TABLE: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawTable(networkObject, filter);
                    }
                };
            }
            default:
            case ENetworkObjectType.BOX: {
                return {
                    ...networkObject,
                    type: EDrawableType.OBJECT,
                    draw() {
                        return component.drawBox(networkObject, filter);
                    }
                };
            }
        }
    };

    /**
     * Draw walls around the room.
     * @param drawable The room to draw walls for.
     * @param index The index of the room.
     */
    drawRoomWalls = (drawable: IObject, index: number) => {
        const {x, y} = drawable;
        const drawables = [] as IDrawable[];

        // top wall
        switch ((drawable as IRoom).doors.top) {
            case ERoomWallType.DOOR: {
                // there is a top door, draw a wall with a top door
                drawables.push({
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-top-left`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,0 200,0 200,5 0,5"/>
                            </g>
                        );
                    }
                }, {
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-top-right`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="300,0 500,0 500,5 300,5"/>
                            </g>
                        );
                    }
                });
                break;
            }
            case ERoomWallType.ENTRANCE: {
                // draw an entrance at the top of the building
                drawables.push({
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-top-left`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,0 200,0 200,5 0,5"/>
                            </g>
                        );
                    }
                }, {
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-top-right`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="300,0 500,0 500,5 300,5"/>
                            </g>
                        );
                    }
                }, {
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-top-door`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown"
                                         points="195,0 195,-205 305,-205 305,0 300,0 300,-200 200,-200 200,0"/>
                            </g>
                        );
                    }
                });
                break;
            }
            default:
            case ERoomWallType.WALL: {
                // there is no top door, draw a plain wall
                drawables.push({
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-top`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,0 500,0 500,5 0,5"/>
                            </g>
                        );
                    }
                });
                break;
            }
            case ERoomWallType.OPEN: {
                // do nothing
            }
        }

        // draw bottom wall
        switch ((drawable as IRoom).doors.bottom) {
            case ERoomWallType.DOOR: {
                // there is a bottom door, draw a wall with a bottom door
                drawables.push({
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-bottom-left`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,295 200,295 200,300 0,300"/>
                            </g>
                        );
                    }
                }, {
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-bottom-right`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="300,295 500,295 500,300 300,300"/>
                            </g>
                        );
                    }
                });
                break;
            }
            case ERoomWallType.ENTRANCE: {
                // there is an entrance at the bottom of the room
                drawables.push({
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-bottom-left`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,295 200,295 200,300 0,300"/>
                            </g>
                        );
                    }
                }, {
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-bottom-right`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="300,295 500,295 500,300 300,300"/>
                            </g>
                        );
                    }
                }, {
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-bottom-door`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown"
                                         points="195,300 195,95 305,95 305,300 300,300 300,100 200,100 200,300"/>
                            </g>
                        );
                    }
                });
                break;
            }
            default:
            case ERoomWallType.WALL: {
                // there is an entrance at the bottom of the room
                drawables.push({
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-bottom`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,295 500,295 500,300 0,300"/>
                            </g>
                        );
                    }
                });
                break;
            }
            case ERoomWallType.OPEN: {
                // do nothing
            }
        }

        // draw left wall
        switch ((drawable as IRoom).doors.left) {
            case ERoomWallType.ENTRANCE:
            case ERoomWallType.DOOR: {
                // there is a left door, draw a wall with a left door
                drawables.push({
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-left-top`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,0 5,0 5,100 0,100"/>
                            </g>
                        );
                    }
                }, {
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-left-bottom`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,200 5,200 5,300 0,300"/>
                            </g>
                        );
                    }
                });
                break;
            }
            default:
            case ERoomWallType.WALL: {
                // there is no left door, draw a plain wall
                drawables.push({
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-left`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,0 5,0 5,300 0,300"/>
                            </g>
                        );
                    }
                });
                break;
            }
            case ERoomWallType.OPEN: {
                // do nothing
            }
        }

        // draw right wall
        switch ((drawable as IRoom).doors.right) {
            case ERoomWallType.ENTRANCE:
            case ERoomWallType.DOOR: {
                // there is a right wall, draw a door with a right wall
                drawables.push({
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-right-top`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="495,0 500,0 500,100 495,100"/>
                            </g>
                        );
                    }
                }, {
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-right-bottom`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="495,200 500,200 500,300 495,300"/>
                            </g>
                        );
                    }
                });
                break;
            }
            default:
            case ERoomWallType.WALL: {
                // there is no right wall, draw a plain wall
                drawables.push({
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-right`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="495,0 500,0 500,300 495,300"/>
                            </g>
                        );
                    }
                });
                break;
            }
            case ERoomWallType.OPEN: {
                // do nothing
            }
        }
        return drawables;
    };

    /**
     * Create a sorted list of all drawable objects for final rendering. Objects at the bottom should overlap objects
     * above them to create a 2D Stereographic Projection, like a 2D with 3D movement arcade game. Sort [[IDrawable]]s
     * from top to bottom so bottom is drawn last, on top of the [[IDrawable]] above it.
     */
    sortDrawables = (): IDrawable[] => {
        const component = this;
        const drawables = [
            // add all persons
            ...this.state.persons.map(person => ({
                draw(this: IDrawable) {
                    return component.drawPerson(this as unknown as IPerson);
                },
                type: EDrawableType.PERSON,
                ...person
            })),

            // for each network object
            ...this.state.objects.reduce((arr: IDrawable[], networkObject: INetworkObject): IDrawable[] => {
                return [
                    ...arr,
                    this.drawNetworkObject(networkObject)
                ];
            }, []),

            // for each room
            ...this.state.rooms.reduce((arr: IDrawable[], room: IRoom, index: number): IDrawable[] => {
                return [
                    ...arr,

                    // add all walls
                    ...component.drawRoomWalls(room, index)
                ];
            }, []),

            // for each car
            ...this.state.cars.reduce((arr: IDrawable[], car: ICar): IDrawable[] => {
                return [
                    ...arr,

                    // add all car parts
                    ...component.drawCar(car)
                ];
            }, [])
        ];

        // sort drawable objects from top to bottom
        return drawables.sort((a, b) => {
            // by default, sort by height difference
            const heightDifference = a.y - b.y;

            if (a.type === EDrawableType.PERSON && b.type !== EDrawableType.PERSON && heightDifference > 30) {
                // person has priority over regular objects
                return 1;
            } else if (b.type === EDrawableType.PERSON && a.type !== EDrawableType.PERSON && heightDifference < 30) {
                // person has priority over regular objects
                return -1;
            } else {
                // sort by height differences
                return heightDifference;
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
    objectNearby = (person: IPerson) => (object: INetworkObject) => {
        return Math.abs(object.x - person.x) <= 100 && Math.abs(object.y - person.y) <= 100;
    };

    /**
     * Generate a random Person Id to control a specific person on the server.
     */
    randomPersonId() {
        return new Array(10).fill(0).map(() => Number(Math.floor(Math.random() * 36)).toString(36)).join("");
    }

    /**
     * Generate the SVG DEFs for room masks.
     */
    generateRoomMasks = () => {
        return this.state.rooms.map((room: IRoom, index: number) => {
            const {x, y} = room;
            return (
                <mask key={`room-${index}`} id={`room-${index}`} x="0" y="0" width="500" height="300">
                    <rect fill="white" x={x + 5} y={y - 200} width={490} height={495}/>
                    {
                        [ERoomWallType.DOOR, ERoomWallType.ENTRANCE].includes(room.doors.left) ?
                            <>
                                <rect fill="white" x={x - 5} y={y - 200} width={10} height={400}/>
                                <rect fill="white" x={x - 105} y={y - 200} width={100} height={595}/>
                            </> :
                            null
                    }
                    {
                        [ERoomWallType.DOOR, ERoomWallType.ENTRANCE].includes(room.doors.right) ?
                            <>
                                <rect fill="white" x={x + 495} y={y - 200} width={10} height={400}/>
                                <rect fill="white" x={x + 505} y={y - 200} width={100} height={595}/>
                            </> :
                            null
                    }
                    {
                        [ERoomWallType.DOOR, ERoomWallType.ENTRANCE].includes(room.doors.bottom) ?
                            <rect fill="white" x={x + 200} y={y + 295} width={100} height={205}/> :
                            room.doors.bottom === ERoomWallType.OPEN ?
                                <rect fill="white" x={x} y={y + 295} width={500} height={205}/> :
                                null
                    }
                </mask>
            );
        })
    };

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