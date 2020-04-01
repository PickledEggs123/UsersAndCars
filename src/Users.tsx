import React from 'react';
import './App.scss';
import axios from "axios";
import {Persons} from "./Persons";

interface IUsersProps {}

interface IUser {
    id: number;
    firstName: string;
    lastName: string;
    age: number;
}

interface IUsersState {
    users: IUser[];
    firstName: string;
    lastName: string;
    age: string;
}

export class Users extends React.Component<IUsersProps, IUsersState> {
    state = {
        users: [],
        firstName: "",
        lastName: "",
        age: ""
    } as IUsersState;

    componentDidMount(): void {
        this.fetchUsers();
    }

    fetchUsers = async () => {
        const response = await axios.get("https://us-central1-tyler-truong-demos.cloudfunctions.net/users");
        this.setState({
            users: response.data
        });
    };

    deleteUser = (user: IUser) => async () => {
        await axios.delete(`https://us-central1-tyler-truong-demos.cloudfunctions.net/users/${user.id}`);
        await this.fetchUsers();
    };

    validNewUserData = () => {
        return this.state.firstName && this.state.lastName && /\d+/.test(this.state.age);
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

    updateInput = (field: keyof Pick<IUsersState, "firstName" | "lastName" | "age">) => (event: React.ChangeEvent<HTMLInputElement>) => {
        this.setState({[field]: event.target.value} as any);
    };

    render() {
        return (
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
                                <div className="item" key={user.id}>
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
        );
    }
}
