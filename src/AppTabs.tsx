import {Link, RouteComponentProps} from "react-router-dom";
import React from "react";

interface IAppTabsProps extends RouteComponentProps {}

/**
 * An object containing the data for an App tab
 */
interface IAppTab {
    /**
     * The URL pathname of the tab.
     */
    path: string;
    /**
     * The text name of the tab.
     */
    name: string;
}

/**
 * A list of tabs in the app.
 */
const appTabs: IAppTab[] = [{
    path: "/persons",
    name: "Persons"
}, {
    path: "/users",
    name: "Users"
}, {
    path: "/cars",
    name: "Cars"
}];

/**
 * A tab bar to select one of three tabs.
 */
export class AppTabs extends React.Component<IAppTabsProps> {
    render() {
        return (
            <div style={{gridTemplateRows: "repeat(1fr, 3)", width: 500}}>
                {
                    appTabs.map(tab => {
                        return (
                            <Link style={{
                                display: "inline-block",
                                padding: 10,
                                margin: 5,
                                backgroundColor: this.props.history.location.pathname === tab.path ? "blue" : "lightblue"
                            }} to={tab.path}>{tab.name}</Link>
                        );
                    })
                }
            </div>
        );
    }
}