import { Text, Flex } from "theme-ui";

import DiceRolls from "./DiceRolls";
import { DiceRoll } from "../../types/Dice";

type NicknameProps = {
  nickname: string;
  diceRolls?: DiceRoll[];
};

function Nickname({ nickname, diceRolls }: NicknameProps) {
  return (
    <Flex sx={{ flexDirection: "column" }}>
      <Text
        as="p"
        my={1}
        variant="body2"
        sx={{
          position: "relative",
        }}
      >
        {nickname}
      </Text>
      {diceRolls && <DiceRolls rolls={diceRolls} />}
    </Flex>
  );
}

export default Nickname;
