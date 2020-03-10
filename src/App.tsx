import React from 'react';
import './App.scss';
import axios from "axios";

interface IAppProps {}

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
}

class App extends React.Component<IAppProps, IAppState> {
    state = {
        users: [],
        cars: [],
        firstName: "",
        lastName: "",
        age: "",
        make: "",
        model: "",
        vin: ""
    } as IAppState;

    componentDidMount(): void {
        this.fetchUsers();
        this.fetchCars();
    }

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

    render() {
        return (
            <div>
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
