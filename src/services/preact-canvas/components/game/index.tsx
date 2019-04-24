/**
 * Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { Remote } from "comlink/src/comlink";
import { Component, h } from "preact";
import { lazyGenerateTextures } from "src/rendering/animation";
import { getRendererInstance, Renderer } from "src/rendering/renderer";
import StateService from "src/services/state";
import { bind } from "src/utils/bind";
import { getCellSizes } from "src/utils/cell-sizing";
import { GameChangeCallback } from "../..";
import { StateChange } from "../../../../gamelogic";
import { Cell, PlayMode } from "../../../../gamelogic/types";
import initFocusHandling from "../../../../utils/focus-visible";
import Board from "../board";
import deferred from "../deferred";
import TopBar from "../top-bar";
import { checkbox, game as gameClass, toggle, toggleLabel } from "./style.css";

export interface Props {
  stateService: Remote<StateService>;
  width: number;
  height: number;
  gameChangeSubscribe: (f: GameChangeCallback) => void;
  gameChangeUnsubscribe: (f: GameChangeCallback) => void;
  onDangerModeChange: (v: boolean) => void;
  dangerMode: boolean;
  toRevealTotal: number;
}

interface State {
  playMode: PlayMode;
  toReveal: number;
  startTime: number;
  endTime: number;
  // This should always be set as we prevent the game from starting until the
  // renderer is loaded.
  renderer?: Renderer;
}

// tslint:disable-next-line:variable-name
const End = deferred(import("../end/index.js").then(m => m.default));

// The second this file is loaded, activate focus handling
initFocusHandling();

export default class Game extends Component<Props, State> {
  state: State;

  constructor(props: Props) {
    super(props);
    this.state = {
      playMode: PlayMode.Pending,
      toReveal: props.toRevealTotal,
      startTime: 0,
      endTime: 0
    };

    getRendererInstance().then(renderer => this.setState({ renderer }));
  }

  render(
    {
      dangerMode,
      width,
      height,
      gameChangeSubscribe,
      gameChangeUnsubscribe,
      toRevealTotal
    }: Props,
    { playMode, toReveal, renderer }: State
  ) {
    const timerRunning = playMode === PlayMode.Playing;

    return (
      <div class={gameClass}>
        <TopBar
          timerRunning={timerRunning}
          toReveal={toReveal}
          toRevealTotal={toRevealTotal}
        />
        {playMode === PlayMode.Won || playMode === PlayMode.Lost ? (
          <End
            loading={() => <div />}
            type={playMode}
            onRestart={this.onRestart}
          />
        ) : renderer ? (
          <Board
            width={width}
            height={height}
            gameChangeSubscribe={gameChangeSubscribe}
            gameChangeUnsubscribe={gameChangeUnsubscribe}
            onCellClick={this.onCellClick}
            renderer={renderer}
          />
        ) : (
          <div />
        )}
        <label class={toggleLabel}>
          Reveal
          <input
            class={checkbox}
            type="checkbox"
            onChange={this.onDangerModeChange}
            checked={!dangerMode}
          />
          <span class={toggle} /> Flag
        </label>
      </div>
    );
  }

  componentDidMount() {
    this.props.gameChangeSubscribe(this.onGameChange);
    if (!this.props.dangerMode) {
      this.props.onDangerModeChange(true);
    }
  }

  componentWillUnmount() {
    this.props.gameChangeUnsubscribe(this.onGameChange);
  }

  @bind
  private onRestart() {
    this.props.stateService.reset();
  }

  @bind
  private onGameChange(gameChange: StateChange) {
    const newState: Partial<State> = {};

    if (
      "playMode" in gameChange &&
      this.state.playMode !== gameChange.playMode
    ) {
      newState.playMode = gameChange.playMode;

      if (gameChange.playMode! === PlayMode.Playing) {
        newState.startTime = Date.now();
      } else if (gameChange.playMode! === PlayMode.Won) {
        newState.endTime = Date.now();
      }
    }

    if (
      "toReveal" in gameChange &&
      this.state.toReveal !== gameChange.toReveal
    ) {
      newState.toReveal = gameChange.toReveal;
    }

    if (Object.keys(newState).length) {
      this.setState(newState as State);
    }
  }

  @bind
  private onDangerModeChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const dangerMode = !target.checked;
    this.props.onDangerModeChange(dangerMode);
  }

  @bind
  private onCellClick(cellData: [number, number, Cell], alt: boolean) {
    const [x, y, cell] = cellData;
    let { dangerMode } = this.props;

    if (alt) {
      dangerMode = !dangerMode;
    }

    if (!cell.revealed) {
      if (!dangerMode) {
        if (cell.flagged) {
          this.props.stateService.unflag(x, y);
        } else {
          this.props.stateService.flag(x, y);
        }
      } else {
        this.props.stateService.reveal(x, y);
      }
    } else if (cell.touchingFlags >= cell.touchingMines) {
      this.props.stateService.revealSurrounding(x, y);
    }
  }
}
