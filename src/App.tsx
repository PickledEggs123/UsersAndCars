import React from 'react';
import './App.scss';
import axios from "axios";

interface IAppProps {}

interface IPerson {
    id: string;
    x: number;
    y: number;
    shirtColor: string;
    pantColor: string;
}

interface IKeyDownHandler {
    key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";
    interval: any;
}

interface IUser {
    id: number;
    firstName: string;
    lastName: string;
    age: number;
}
interface ICar {
    id: number;
    make: string;
    model: string;
    vin: string;
}

interface IAppState {
    users: IUser[];
    cars: ICar[];
    firstName: string;
    lastName: string;
    age: string;
    make: string;
    model: string;
    vin: string;
    persons: IPerson[];
    currentPersonId: string;
    update: boolean;
}

class App extends React.Component<IAppProps, IAppState> {
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
        users: [],
        cars: [],
        firstName: "",
        lastName: "",
        age: "",
        make: "",
        model: "",
        vin: "",
        persons: [],
        currentPersonId: this.randomPersonId(),
        update: false
    } as IAppState;

    componentDidMount(): void {
        this.fetchUsers();
        this.fetchCars();
        this.createPerson();
        this.beginGameLoop();
    }

    componentWillUnmount(): void {
        this.deletePerson();
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
            const persons = response.data;
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
            case "ArrowUp": {
                this.keyDownHandlers.push({
                    key: "ArrowUp",
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
            case "ArrowDown": {
                this.keyDownHandlers.push({
                    key: "ArrowDown",
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
            case "ArrowLeft": {
                this.keyDownHandlers.push({
                    key: "ArrowLeft",
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
            case "ArrowRight": {
                this.keyDownHandlers.push({
                    key: "ArrowRight",
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

    fetchUsers = async () => {
        const response = await axios.get("https://us-central1-tyler-truong-demos.cloudfunctions.net/users");
        this.setState({
            users: response.data
        });
    };

    fetchCars = async () => {
        const response = await axios.get("https://us-central1-tyler-truong-demos.cloudfunctions.net/cars");
        this.setState({
            cars: response.data
        });
    };

    deleteUser = (user: IUser) => async () => {
        await axios.delete(`https://us-central1-tyler-truong-demos.cloudfunctions.net/users/${user.id}`);
        await this.fetchUsers();
    };

    deleteCar = (user: ICar) => async () => {
        await axios.delete(`https://us-central1-tyler-truong-demos.cloudfunctions.net/cars/${user.id}`);
        await this.fetchCars();
    };

    validNewUserData = () => {
        return this.state.firstName && this.state.lastName && /\d+/.test(this.state.age);
    };

    validNewCarData = () => {
        return this.state.make && this.state.model && this.state.vin;
    };

    addUser = async () => {
        if (this.validNewUserData()) {
            const {
                firstName,
                lastName
            } = this.state;
            let age: number | undefined;
            const ageMatch = /(\d+)/.exec(this.state.age);
            if (ageMatch && ageMatch[1]) {
                age = Number(ageMatch[1]);
            }

            if (typeof age === "number") {
                const data = {
                    firstName,
                    lastName,
                    age
                };
                await axios.post("https://us-central1-tyler-truong-demos.cloudfunctions.net/users", data);
                await this.fetchUsers();
                this.setState({
                    firstName: "",
                    lastName: "",
                    age: ""
                });
            }
        }
    };

    addCar = async () => {
        if (this.validNewCarData()) {
            const {
                make,
                model,
                vin
            } = this.state;

            const data = {
                make,
                model,
                vin
            };
            await axios.post("https://us-central1-tyler-truong-demos.cloudfunctions.net/cars", data);
            await this.fetchCars();
            this.setState({
                make: "",
                model: "",
                vin: ""
            });
        }
    };

    updateInput = (field: keyof Pick<IAppState, "firstName" | "lastName" | "age" | "make" | "model" | "vin">) => (event: React.ChangeEvent<HTMLInputElement>) => {
        this.setState({[field]: event.target.value} as any);
    };

    randomPersonId() {
        return new Array(10).fill(0).map(() => Number(Math.floor(Math.random() * 36)).toString(36)).join("");
    }

    drawPerson = (person: IPerson) => {
        const {x, y} = person;
        return (
            <g key={person.id} transform={`translate(${x - 50},${y - 100})`}>
                <polygon fill="brown" points="40,10 60,10 60,30 40,30"/>
                <polygon fill="brown" points="20,30 80,30 80,100 20,100"/>
                <polygon fill="blue" points="20,100 80,100 80,120 20,120"/>
                <polygon fill="blue" points="20,120 40,120 40,200 20,200"/>
                <polygon fill="blue" points="80,120 60,120 60,200 80,200"/>
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
            <div>
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
                <div className="users">
                    <h1>Users</h1>
                    <div>
                        <h2>Create User</h2>
                        <div>
                            <label>First Name: </label>
                            <input onChange={this.updateInput("firstName")} value={this.state.firstName}/>
                        </div>
                        <div>
                            <label>Last Name: </label>
                            <input onChange={this.updateInput("lastName")} value={this.state.lastName}/>
                        </div>
                        <div>
                            <label>Age: </label>
                            <input onChange={this.updateInput("age")} value={this.state.age}/>
                        </div>
                        <div className={`create${this.validNewUserData() ? "" : " disabled"}`}
                             onClick={this.validNewUserData() ? this.addUser : undefined}
                        >
                            Add New User
                        </div>
                    </div>
                    <div>
                        {
                            this.state.users.map(user => {
                                return (
                                    <div className="user" key={user.id}>
                                        <div className="row">UserID: {user.id}</div>
                                        <div className="row">First Name: {user.firstName}</div>
                                        <div className="row">Last Name: {user.lastName}</div>
                                        <div className="row">Full Name: {user.firstName} {user.lastName}</div>
                                        <div className="row">Age: {user.age}</div>
                                        <div className="delete row" onClick={this.deleteUser(user)}>Delete</div>
                                    </div>
                                );
                            })
                        }
                    </div>
                </div>
                <div className="users">
                    <h1>Cars</h1>
                    <div>
                        <h2>Create Car</h2>
                        <div>
                            <label>Make: </label>
                            <input onChange={this.updateInput("make")} value={this.state.make}/>
                        </div>
                        <div>
                            <label>Model: </label>
                            <input onChange={this.updateInput("model")} value={this.state.model}/>
                        </div>
                        <div>
                            <label>VIN: </label>
                            <input onChange={this.updateInput("vin")} value={this.state.vin}/>
                        </div>
                        <div className={`create${this.validNewCarData() ? "" : " disabled"}`}
                             onClick={this.validNewCarData() ? this.addCar : undefined}
                        >
                            Add New Car
                        </div>
                    </div>
                    <div>
                        {
                            this.state.cars.map(car => {
                                return (
                                    <div className="user" key={car.id}>
                                        <div className="row">CarID: {car.id}</div>
                                        <div className="row">Make: {car.make}</div>
                                        <div className="row">Model: {car.model}</div>
                                        <div className="row">VIN: {car.vin}</div>
                                        <div className="delete row" onClick={this.deleteCar(car)}>Delete</div>
                                    </div>
                                );
                            })
                        }
                    </div>
                </div>
            </div>
        )
    }
}

export default App;
