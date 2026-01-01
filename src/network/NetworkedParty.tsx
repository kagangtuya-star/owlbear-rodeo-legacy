import { useEffect, useRef } from "react";
import { useToasts } from "react-toast-notifications";

import Session from "./Session";

import { useParty } from "../contexts/PartyContext";

import Party from "../components/party/Party";

type NetworkedPartyProps = { gameId: string; session: Session };

function NetworkedParty({ gameId, session }: NetworkedPartyProps) {
  const partyState = useParty();
  const { addToast } = useToasts();

  // Keep a reference to players who have just joined to show the joined notification
  const joinedPlayersRef = useRef<string[]>([]);
  useEffect(() => {
    if (joinedPlayersRef.current.length > 0) {
      for (let id of joinedPlayersRef.current) {
        if (partyState[id]) {
          addToast(`${partyState[id].nickname} joined the party`);
        }
      }
      joinedPlayersRef.current = [];
    }
  }, [partyState, addToast]);

  useEffect(() => {
    function handlePlayerJoined(sessionId: string) {
      if (partyState[sessionId]) {
        addToast(`${partyState[sessionId].nickname} joined the party`);
      } else {
        joinedPlayersRef.current.push(sessionId);
      }
    }

    function handlePlayerLeft(sessionId: string) {
      if (partyState[sessionId]) {
        addToast(`${partyState[sessionId].nickname} left the party`);
      }
    }

    session.on("playerJoined", handlePlayerJoined);
    session.on("playerLeft", handlePlayerLeft);

    return () => {
      session.off("playerJoined", handlePlayerJoined);
      session.off("playerLeft", handlePlayerLeft);
    };
  }, [session, partyState, addToast]);

  return <Party gameId={gameId} />;
}

export default NetworkedParty;
