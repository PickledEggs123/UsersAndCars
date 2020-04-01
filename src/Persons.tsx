import React from 'react';
import './App.scss';
import axios from "axios";

interface IPersonsProps {}

interface IPerson {
    id: string;
    x: number;
    y: number;
    shirtColor: string;
    pantColor: string;
    lastUpdate: string;
}

interface IKeyDownHandler {
    key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "w" | "a" | "s" | "d";
    interval: any;
}

interface IPersonsState {
    persons: IPerson[];
    currentPersonId: string;
    lastUpdate: string;
}

export class Persons extends React.Component<IPersonsProps, IPersonsState> {
    /**
     * The interval containing the game loop.
     */
    intervalGameLoop: any = null;

    /**
     * Set Intervals that move the user across the screen.
     */
    keyDownHandlers: IKeyDownHandler[] = [];

    gameRefreshSpeed: number = 2000;

    state = {
        persons: [],
        currentPersonId: this.randomPersonId(),
        lastUpdate: new Date().toISOString()
    } as IPersonsState;

    componentDidMount(): void {
        this.beginGameLoop();
    }

    componentWillUnmount(): void {
        this.endGameLoop();
    }

    createPerson = async () => {
        await axios.post(`https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/${this.state.currentPersonId}`);
    };

    updatePerson = async () => {
        const data = this.state.persons.find(person => person.id === this.state.currentPersonId);
        if (data) {
            await axios.put(`https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/${this.state.currentPersonId}`, {
                ...data,
                lastUpdate: this.state.lastUpdate
            });
        }
    };

    deletePerson = async () => {
        await axios.delete(`https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/${this.state.currentPersonId}`);
    };

    beginGameLoop = () => {
        this.intervalGameLoop = setTimeout(this.gameLoop, this.gameRefreshSpeed);
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        (async () => {
            const response = await axios.get("https://us-central1-tyler-truong-demos.cloudfunctions.net/persons");
            if (response && response.data) {
                const persons = response.data as IPerson[];
                await Promise.all(persons.map(person => {
                    return axios.delete(`https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/${person.id}`);
                }));
            }
        })();
    };

    endGameLoop = () => {
        if (this.intervalGameLoop) {
            clearTimeout(this.intervalGameLoop);
            this.intervalGameLoop = null;
        }
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
        this.deletePerson();
    };

    gameLoop = async () => {
        const currentPerson = this.state.persons.find(person => person.id === this.state.currentPersonId);
        if (!currentPerson) {
            this.createPerson();
        }

        if (currentPerson && +Date.parse(this.state.lastUpdate) > +Date.parse(currentPerson.lastUpdate)) {
            await this.updatePerson();
        }

        const response = await axios.get("https://us-central1-tyler-truong-demos.cloudfunctions.net/persons");
        if (response && response.data) {
            // get persons data from the server
            const serverPersons = response.data as IPerson[];

            // modify server data with local data, pick most up to date version of the data
            const persons = serverPersons.reduce((arr: IPerson[], person: IPerson): IPerson[] => {
                console.log("PERSON", person.lastUpdate, this.state.lastUpdate);
                // check to see if the local data is more up to date.
                if (currentPerson && person.id === this.state.currentPersonId && +Date.parse(person.lastUpdate) <= +Date.parse(this.state.lastUpdate)) {
                    // local data is more up to date, replace server position with local position, to prevent backward moving glitch
                    const {x, y} = currentPerson;
                    return [
                        ...arr,
                        {
                            ...person,
                            x,
                            y
                        }
                    ]
                } else {
                    // server is up to date, no changes
                    return [...arr, person];
                }
            }, []);
            this.setState({persons});
        }

        // schedule next game loop
        this.intervalGameLoop = setTimeout(this.gameLoop, this.gameRefreshSpeed);
    };

    /**
     * Detect if the object is a person.
     * @param person The object to detect as a person.
     */
    isPerson = (person: any): person is IPerson => {
        return person && typeof person.id === "string" && typeof person.x === "number" && typeof person.y === "number" &&
            typeof person.shirtColor === "string" && person.pantColor === "string";
    };

    /**
     * Generic handler that handles any keyboard movement, add update function to determine how to update the object.
     * The code for WASD keys movement is identical except for one line, adding or subtracting x or y.
     * @param event
     */
    handleKeyDownMovement = (event: KeyboardEvent) => (update: (person: IPerson) => IPerson) => {
        this.keyDownHandlers.push({
            key: event.key as any,
            interval: setInterval(() => {
                const persons = this.state.persons.reduce((arr: IPerson[], person: IPerson): IPerson[] => {
                    if (person.id === this.state.currentPersonId) {
                        return [...arr, update(person)];
                    } else {
                        return [...arr, person];
                    }
                }, []);
                this.setState({
                    persons,
                    lastUpdate: new Date().toISOString()
                });
            }, 100)
        });
    };

    /**
     * Handle the movement of the current person across the screen.
     * @param event
     */
    handleKeyDown = (event: KeyboardEvent) => {
        // ignore repeat key down events to prevent multiple key presses being registered.
        if (event.repeat) {
            return;
        }

        // for each key press type
        switch (event.key) {
            case "w":
            case "ArrowUp": {
                this.handleKeyDownMovement(event)((person: IPerson): IPerson => ({
                    ...person,
                    y: person.y - 10
                }));
                break;
            }
            case "s":
            case "ArrowDown": {
                this.handleKeyDownMovement(event)((person: IPerson): IPerson => ({
                    ...person,
                    y: person.y + 10
                }));
                break;
            }
            case "a":
            case "ArrowLeft": {
                this.handleKeyDownMovement(event)((person: IPerson): IPerson => ({
                    ...person,
                    x: person.x - 10
                }));
                break;
            }
            case "d":
            case "ArrowRight": {
                this.handleKeyDownMovement(event)((person: IPerson): IPerson => ({
                    ...person,
                    x: person.x + 10
                }));
                break;
            }
        }
    };

    /**
     * Handle the key up event on the SVG canvas. It cancels the interval that moves the person on the screen.
     * @param event
     */
    handleKeyUp = (event: KeyboardEvent) => {
        // for all handlers
        while (true) {
            // find handler for corresponding key up
            const index = this.keyDownHandlers.findIndex((handler) => {
                return handler.key === event.key
            });
            // if found
            if (index >= 0) {
                // remove using mutable method
                const handlers = this.keyDownHandlers.splice(index, 1);
                // clear all set intervals for each handler
                handlers.forEach(handler => {
                    if (handler.interval) {
                        clearInterval(handler.interval);
                        handler.interval = null;
                    }
                });
            } else {
                // no more handlers, exit loop
                break;
            }
        }
    };

    /**
     * Handle the person's shirt color. Allow customization of shirt color.
     * @param event
     */
    handleShirtColor = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const person = this.state.persons.find(person => person.id === this.state.currentPersonId);
        if (person) {
            // mutable update of shirt color
            person.shirtColor = event.target.value;
            // set the update flag to let the next game loop update the shirt color
            this.setState({lastUpdate: new Date().toISOString()});
        }
    };

    /**
     * Handle the person's pant color. Allow customization of pant color.
     * @param event
     */
    handlePantColor = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const person = this.state.persons.find(person => person.id === this.state.currentPersonId);
        if (person) {
            // mutable update of pant color
            person.pantColor = event.target.value;
            // set the update flag to let the next game loop update the pant color
            this.setState({lastUpdate: new Date().toISOString()});
        }
    };

    randomPersonId() {
        return new Array(10).fill(0).map(() => Number(Math.floor(Math.random() * 36)).toString(36)).join("");
    }

    drawPerson = (person: IPerson) => {
        const {x, y} = person;
        return (
            <g key={person.id} transform={`translate(${x - 50},${y - 100})`}>
                <polygon fill="yellow" points="40,10 60,10 60,30 40,30"/>
                <polygon fill={person.shirtColor} points="20,30 80,30 80,100 20,100"/>
                <polygon fill={person.pantColor} points="20,100 80,100 80,120 20,120"/>
                <polygon fill={person.pantColor} points="20,120 40,120 40,200 20,200"/>
                <polygon fill={person.pantColor} points="80,120 60,120 60,200 80,200"/>
            </g>
        );
    };

    drawTable = (x: number, y: number) => {
        return (
            <g transform={`translate(${x - 100},${y - 50})`}>
                <polygon fill="brown" points="0,100 200,100 200,0 0,0"/>
            </g>
        );
    };

    drawChair = (x: number, y: number) => {
        return (
            <g transform={`translate(${x - 50},${y - 50})`}>
                <polygon fill="brown" points="10,90 20,90 20,10 10,10"/>
                <polygon fill="brown" points="80,90 90,90 90,10 80,10"/>
                <polygon fill="brown" points="40,90 60,90 60,10 40,10"/>
                <polygon fill="brown" points="10,10 90,10 90,20 10,20"/>
                <polygon fill="brown" points="10,50 90,50 90,90 10,90"/>
            </g>
        );
    };

    render() {
        return (
            <div className="persons">
                <h1>Multiplayer Room</h1>
                <p>Use the left and right arrow keys or WASD keys to move the player left and right within the room.</p>
                <svg className="game" width={500} height={300} style={{border: "1px solid black"}}>
                    {this.drawChair(200, 50)}
                    {this.drawChair(300, 50)}
                    {this.drawChair(200, 250)}
                    {this.drawChair(300, 250)}
                    {
                        this.state.persons.map(person => {
                            return this.drawPerson(person);
                        })
                    }
                    {this.drawTable(250, 150)}
                </svg>
                <div>
                    <p>Select a custom shirt color for your character.</p>
                    <label>Shirt Color</label>
                    <select onChange={this.handleShirtColor}>
                        <option>grey</option>
                        <option>red</option>
                        <option>blue</option>
                        <option>tan</option>
                        <option>black</option>
                    </select>
                </div>
                <div>
                    <p>Select a custom pant color for your character.</p>
                    <label>Pant Color</label>
                    <select onChange={this.handlePantColor}>
                        <option>blue</option>
                        <option>black</option>
                        <option>grey</option>
                        <option>purple</option>
                        <option>red</option>
                        <option>green</option>
                    </select>
                </div>
            </div>
        );
    }
}
