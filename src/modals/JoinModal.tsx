import { useState, useRef, FormEvent, ChangeEvent } from "react";
import { Box, Label, Input, Button, Flex } from "theme-ui";
import { useHistory } from "react-router-dom";

import Modal from "../components/Modal";

import { RequestCloseEventHandler } from "../types/Events";

type JoinModalProps = {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
};

function JoinModal({ isOpen, onRequestClose }: JoinModalProps) {
  let history = useHistory();
  const [gameId, setGameId] = useState("");

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setGameId(event.target?.value);
  }

  function handleSubmit(event: FormEvent<HTMLDivElement>) {
    event.preventDefault();
    history.push(`/game/${gameId}`);
  }

  const inputRef = useRef<HTMLInputElement>(null);
  function focusInput() {
    inputRef.current?.focus();
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      onAfterOpen={focusInput}
    >
      <Flex
        sx={{
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: "300px",
          flexGrow: 1,
        }}
        m={2}
      >
        <Box as="form" onSubmit={handleSubmit}>
          <Label htmlFor="id">让我看看你的加入密钥</Label>
          <Input
            mt={1}
            mb={3}
            id="id"
            name="id"
            value={gameId || ""}
            onChange={handleChange}
            ref={inputRef}
          />
          <Flex>
            <Button sx={{ flexGrow: 1 }} disabled={!gameId}>
              加入！
            </Button>
          </Flex>
        </Box>
      </Flex>
    </Modal>
  );
}

export default JoinModal;
