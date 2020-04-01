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
}

interface IKeyDownHandler {
    key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "w" | "a" | "s" | "d";
    interval: any;
}

interface IPersonsState {
    persons: IPerson[];
    currentPersonId: string;
    update: boolean;
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
        update: false
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
            await axios.put(`https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/${this.state.currentPersonId}`, data);
        }
    };

    deletePerson = async () => {
        await axios.delete(`https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/${this.state.currentPersonId}`);
    };

    beginGameLoop = () => {
        this.intervalGameLoop = setTimeout(this.gameLoop, this.gameRefreshSpeed);
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);

        // delete all previous users
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
    };

    gameLoop = async () => {
        const currentPerson = this.state.persons.find(person => person.id === this.state.currentPersonId);
        if (!currentPerson) {
            this.createPerson();
        }

        if (this.state.update) {
            await this.updatePerson();
            await new Promise((resolve) => {
                this.setState({update: false}, () => {
                    resolve();
                });
            });
        }

        const response = await axios.get("https://us-central1-tyler-truong-demos.cloudfunctions.net/persons");
        if (response && response.data) {
            const persons = response.data as IPerson[];
            this.setState({persons});
        }

        this.intervalGameLoop = setTimeout(this.gameLoop, this.gameRefreshSpeed);
    };

    isPerson = (person: any): person is IPerson => {
        return person && typeof person.id === "string" && typeof person.x === "number" && typeof person.y === "number" &&
            typeof person.shirtColor === "string" && person.pantColor === "string";
    };

    /**
     * Handle the movement of the current person across the screen.
     * @param event
     */
    handleKeyDown = (event: KeyboardEvent) => {
        switch (event.key) {
            case "w":
            case "ArrowUp": {
                this.keyDownHandlers.push({
                    key: event.key,
                    interval: setInterval(() => {
                        const person = this.state.persons.find(person => person.id === this.state.currentPersonId);
                        if (person) {
                            person.y -= 1;
                            this.setState({update: true});
                        }
                    }, 100)
                });
                break;
            }
            case "s":
            case "ArrowDown": {
                this.keyDownHandlers.push({
                    key: event.key,
                    interval: setInterval(() => {
                        const person = this.state.persons.find(person => person.id === this.state.currentPersonId);
                        if (person) {
                            person.y += 1;
                            this.setState({update: true});
                        }
                    }, 100)
                });
                break;
            }
            case "a":
            case "ArrowLeft": {
                this.keyDownHandlers.push({
                    key: event.key,
                    interval: setInterval(() => {
                        const person = this.state.persons.find(person => person.id === this.state.currentPersonId);
                        if (person) {
                            person.x -= 1;
                            this.setState({update: true});
                        }
                    }, 100)
                });
                break;
            }
            case "d":
            case "ArrowRight": {
                this.keyDownHandlers.push({
                    key: event.key,
                    interval: setInterval(() => {
                        const person = this.state.persons.find(person => person.id === this.state.currentPersonId);
                        if (person) {
                            person.x += 1;
                            this.setState({update: true});
                        }
                    }, 100)
                });
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
            this.setState({update: true});
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
            this.setState({update: true});
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
