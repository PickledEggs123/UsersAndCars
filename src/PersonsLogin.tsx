import * as React from "react";
import axios from "axios";
import {IApiPersonsLoginPost} from "persons-game-common/lib/types/GameTypes";
import {PUBLIC_API_URL} from "./config";

/**
 * The props for [[PersonsLogin]].
 */
interface IPersonsLoginProps {
    /**
     * Callback which loads the successful login username.
     * @param username The successful login username.
     */
    loginSuccess(username: string): void;
}

/**
 * The state for [[PersonsLogin]].
 */
interface IPersonsLoginState {
    /**
     * If the modal is visible.
     */
    visible: boolean;
    /**
     * The username in the username field.
     */
    username: string;
    /**
     * The password in the password field.
     */
    password: string;
    /**
     * If a login attempt is currently running.
     */
    loginAttempt: boolean;
    /**
     * If a login attempt failed.
     */
    loginFailed: boolean;
}

/**
 * The login component to login into the [[Persons]] game.
 */
export class PersonsLogin extends React.Component<IPersonsLoginProps, IPersonsLoginState> {
    state = {
        visible: false,
        username: "",
        password: "",
        loginAttempt: false,
        loginFailed: false
    };

    componentDidMount(): void {
        // if visible, get credentials on load
        if (this.state.visible) {
            this.getCredentialsFromLocalStorage();
        }
    }

    componentDidUpdate(prevProps: Readonly<IPersonsLoginProps>, prevState: Readonly<IPersonsLoginState>, snapshot?: any): void {
        // if now visible, get credentials
        if (!prevState.visible && this.state.visible) {
            this.getCredentialsFromLocalStorage();
        }
    }

    /**
     * Get username and password, which could be saved in local storage.
     */
    getCredentialsFromLocalStorage = () => {
        const username = localStorage.getItem("username") || "";
        const password = localStorage.getItem("password") || "";
        this.setState({username, password});
    };

    /**
     * Handle username text change.
     * @param event
     */
    handleUsername = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.setState({username: event.target.value});
    };

    /**
     * Handle password text change.
     * @param event
     */
    handlePassword = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.setState({password: event.target.value});
    };

    /**
     * Perform the login attempt.
     */
    login = async () => {
        // begin login attempt
        this.setState({
            loginAttempt: true,
            loginFailed: false
        });

        try {
            // make login attempt
            const data: IApiPersonsLoginPost = {
                id: this.state.username,
                password: this.state.password
            };
            await axios.post(`${PUBLIC_API_URL}persons/login`, data);

            // save credentials to local storage
            localStorage.setItem("username", this.state.username);
            localStorage.setItem("password", this.state.password);

            // close modal
            this.setState({
                visible: false,
                loginAttempt: false
            });

            this.props.loginSuccess(this.state.username);
        } catch (e) {
            // failed login attempt, reset password field
            this.setState({
                loginFailed: true,
                loginAttempt: false,
                password: ""
            });
        }
    };

    /**
     * Open the modal.
     */
    toggleOpen = () => {
        this.setState({visible: !this.state.visible});
    };

    /**
     * Close the modal.
     */
    close = () => {
        this.setState({
            visible: false,
            username: "",
            password: "",
            loginFailed: false
        });
    };

    render() {
        return (
            <div className={`login modal${this.state.visible ? " show": " hide"}`}>
                <label style={{gridArea: "label-user"}}>Username</label>
                <input style={{gridArea: "user"}} type="text" value={this.state.username} onChange={this.handleUsername}/>
                <label style={{gridArea: "label-pass"}}>Password</label>
                <input style={{gridArea: "pass"}} type="password" value={this.state.password} onChange={this.handlePassword}/>
                <button style={{gridArea: "login"}} onClick={this.login}>Login</button>
                <button style={{gridArea: "cancel"}} onClick={this.close}>Cancel</button>
                {
                    this.state.loginAttempt ? (
                        <span style={{gridArea: "status"}} className="login-attempt">Login Attempt...</span>
                    ) : <span style={{gridArea: "status"}}/>
                }
                {
                    this.state.loginFailed ? (
                        <span style={{gridArea: "status"}} className="login-failed">Login Failed.</span>
                    ) : <span style={{gridArea: "status"}}/>
                }
            </div>
        )
    }
}
