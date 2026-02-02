import { useEffect, useState, useRef, useCallback } from "react";
import cloneDeep from "lodash.clonedeep";
import { Diff } from "deep-diff";

import useDebounce from "./useDebounce";
import { diff, applyChanges } from "../helpers/diff";
import Session from "../network/Session";

/**
 * @param update The updated state or a state function passed into setState
 * @param sync Whether to sync the update with the session
 * @param force Whether to force a full update, usefull when partialUpdates is enabled
 */
export type SetNetworkedState<S> = (
  update: React.SetStateAction<S>,
  sync?: boolean,
  force?: boolean,
  updateLastSynced?: boolean
) => void;

type Update<T> = {
  id: string;
  changes: Diff<T>[];
};

/**
 * Helper to sync a react state to a `Session`
 *
 * @param {S} initialState
 * @param {Session} session `Session` instance
 * @param {string} eventName Name of the event to send to the session
 * @param {number} debounceRate Amount to debounce before sending to the session (ms)
 * @param {boolean} partialUpdates Allow sending of partial updates to the session
 * @param {string} partialUpdatesKey Key to lookup in the state to identify a partial update
 */
function useNetworkedState<S extends { readonly [x: string]: any } | null>(
  initialState: S,
  session: Session,
  eventName: string,
  debounceRate: number = 500,
  partialUpdates: boolean = true,
  partialUpdatesKey: string = "id",
  normalize?: (state: S) => S
): [S, SetNetworkedState<S>] {
  const [state, _setState] = useState(initialState);
  // Used to control whether the state needs to be sent to the socket
  const dirtyRef = useRef(false);

  // Used to force a full update
  const forceUpdateRef = useRef(false);
  const updateLastSyncedRef = useRef(false);

  // Update dirty at the same time as state
  const setState = useCallback<SetNetworkedState<S>>(
    (update, sync = true, force = false, updateLastSynced = false) => {
      dirtyRef.current = dirtyRef.current || sync;
      forceUpdateRef.current = forceUpdateRef.current || force;
      updateLastSyncedRef.current =
        updateLastSyncedRef.current || updateLastSynced;
      _setState(update);
    },
    []
  );

  const debouncedState = useDebounce(state, debounceRate);
  const lastSyncedStateRef = useRef<S>();
  useEffect(() => {
    if (dirtyRef.current) {
      // If partial updates enabled, send just the changes to the socket
      if (
        lastSyncedStateRef.current &&
        debouncedState &&
        partialUpdates &&
        !forceUpdateRef.current
      ) {
        const changes = diff(lastSyncedStateRef.current, debouncedState);
        if (changes) {
          if (!debouncedState) {
            return;
          }
          const update = { id: debouncedState[partialUpdatesKey], changes };
          session.socket?.emit(`${eventName}_update`, update);
        }
      } else {
        session.socket?.emit(eventName, debouncedState);
      }
      dirtyRef.current = false;
      forceUpdateRef.current = false;
      lastSyncedStateRef.current = cloneDeep(debouncedState);
      updateLastSyncedRef.current = false;
      return;
    }
    if (updateLastSyncedRef.current) {
      lastSyncedStateRef.current = cloneDeep(debouncedState);
      updateLastSyncedRef.current = false;
    }
  }, [
    session.socket,
    eventName,
    debouncedState,
    partialUpdates,
    partialUpdatesKey,
  ]);

  useEffect(() => {
    function handleSocketEvent(data: S) {
      const normalized = normalize ? normalize(data) : data;
      _setState(normalized);
      lastSyncedStateRef.current = normalized;
    }

    function handleSocketUpdateEvent(update: Update<S>) {
      _setState((prevState) => {
        if (prevState && prevState[partialUpdatesKey] === update.id) {
          let newState = { ...prevState } as S;
          applyChanges(newState, update.changes);
          if (normalize) {
            newState = normalize(newState);
          }
          if (lastSyncedStateRef.current) {
            applyChanges(lastSyncedStateRef.current, update.changes);
            if (normalize) {
              lastSyncedStateRef.current = normalize(lastSyncedStateRef.current);
            }
          }
          return newState;
        } else {
          return prevState;
        }
      });
    }

    session.socket?.on(eventName, handleSocketEvent);
    session.socket?.on(`${eventName}_update`, handleSocketUpdateEvent);
    return () => {
      session.socket?.off(eventName, handleSocketEvent);
      session.socket?.off(`${eventName}_update`, handleSocketUpdateEvent);
    };
  }, [session.socket, eventName, partialUpdatesKey, normalize]);

  return [state, setState];
}

export default useNetworkedState;
