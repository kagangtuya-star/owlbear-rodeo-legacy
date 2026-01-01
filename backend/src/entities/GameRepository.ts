import { PlayerState } from "../types/PlayerState";
import { PartyState } from "../types/PartyState";
import { MapState } from "../types/MapState";
import { Manifest } from "../types/Manifest";
import { Map } from "../types/Map";
import Game from "./Game";

export default class GameRepository {
  games: Record<string, Game>;

  constructor() {
    this.games = {};
  }

  setGameCreation(gameId: string, hash: string): void {
    const game = new Game(gameId, hash);

    this.games[gameId] = game;
  }

  isGameCreated(gameId: string): boolean {
    if (this.games[gameId] === undefined) {
      return false;
    }

    return true;
  }

  getPartyState(gameId: string): PartyState {
    const game = this.getOrCreateGame(gameId);

    const result = game.getPartyState();

    return result;
  }

  getGamePasswordHash(gameId: string): string {
    const game = this.getOrCreateGame(gameId);

    const result = game.getGamePasswordHash();

    return result;
  }

  setGamePasswordHash(gameId: string, hash: string): void {
    const game = this.getOrCreateGame(gameId);

    game.setGamePasswordHash(hash);
  }

  private getOrCreateGame(gameId: string): Game {
    let game = this.games[gameId];
    if (!game) {
      game = new Game(gameId, "");
      this.games[gameId] = game;
    }
    return game;
  }

  setPlayerState(
    gameId: string,
    playerState: PlayerState,
    playerId: string
  ): void {
    const game = this.getOrCreateGame(gameId);
    game.setPlayerState(playerState, playerId);
  }

  deletePlayer(gameId: string, playerId: string): void {
    const game = this.games[gameId];
    if (!game) {
      return;
    }
    game.deletePlayer(playerId);
  }

  deleteGameData(gameId: string): void {
    const game = this.games[gameId];
    if (!game) {
      return;
    }
    game.deleteGameData();
  }

  setState(
    gameId: string,
    field: "map" | "mapState" | "manifest",
    value: any
  ): void {
    const game = this.getOrCreateGame(gameId);
    game.setState(field, value);
  }

  getState(
    gameId: string,
    field: "map" | "mapState" | "manifest"
  ): MapState | Manifest | Map | undefined {
    const game = this.games[gameId];
    if (!game) {
      return undefined;
    }
    const result = game.getState(field);
    return result;
  }
}
