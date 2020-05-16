import {IObjectHealth} from "persons-game-common/lib/types/GameTypes";

/**
 * Configuration settings for the game.
 */

/**
 * The default value for person health.
 */
export const defaultPersonHealthObject: IObjectHealth = {
    max: 10,
    value: 10,
    rate: 1
};
/**
 * The default value for car health.
 */
export const defaultCarHealthObject: IObjectHealth = {
    max: 24,
    value: 24,
    // car aging
    rate: -0.002
};
/**
 * The default value for object health.
 */
export const defaultObjectHealthObject: IObjectHealth = {
    max: 1,
    value: 1,
    rate: 0
};
/**
 * The size of each cell in the game world.
 */
export const cellSize = 2000;