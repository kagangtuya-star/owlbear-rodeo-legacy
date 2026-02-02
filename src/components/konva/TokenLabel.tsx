import Konva from "konva";
import { useRef, useEffect, useState } from "react";
import { Rect, Text, Group } from "react-konva";

import useSetting from "../../hooks/useSetting";
import { TokenState } from "../../types/TokenState";

const maxTokenSize = 3;
const defaultFontSize = 144;
const minFontSize = 16;

type TokenLabelProps = {
  tokenState: TokenState;
  width: number;
  height: number;
};

function TokenLabel({ tokenState, width, height }: TokenLabelProps) {
  const [labelSize] = useSetting<number>("map.labelSize");

  const paddingY =
    (height / 12 / tokenState.size) * Math.min(tokenState.size, maxTokenSize);
  const paddingX =
    (height / 8 / tokenState.size) * Math.min(tokenState.size, maxTokenSize);

  const [fontScale, setFontScale] = useState(0);
  useEffect(() => {
    const text = textSizerRef.current;

    if (!text) {
      return;
    }

    let fontSizes: number[] = [];
    for (let size = minFontSize * labelSize; size >= 6; size--) {
      const verticalSize = height / size / tokenState.size;
      const tokenSize = Math.min(tokenState.size, maxTokenSize);
      const fontSize = verticalSize * tokenSize * labelSize;
      fontSizes.push(fontSize);
    }

    const findFontScale = () => {
      const size = fontSizes.reduce((prev, curr) => {
        text.fontSize(curr);
        const textWidth = text.getTextWidth() + paddingX * 2;
        if (textWidth < width) {
          return curr;
        } else {
          return prev;
        }
      }, 1);

      setFontScale(size / defaultFontSize);
    };

    findFontScale();
  }, [
    tokenState.label,
    tokenState.visible,
    width,
    height,
    tokenState,
    labelSize,
    paddingX,
  ]);

  const [rectWidth, setRectWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  useEffect(() => {
    const text = textRef.current;
    if (text && tokenState.label) {
      setRectWidth(text.getTextWidth() * fontScale + paddingX * 2);
      setTextWidth(text.getTextWidth() * fontScale);
    } else {
      setRectWidth(0);
      setTextWidth(0);
    }
  }, [tokenState.label, paddingX, width, fontScale]);

  const textRef = useRef<Konva.Text>(null);
  const textSizerRef = useRef<Konva.Text>(null);

  const overlayOffset = Math.max(0, Math.round(height * 0.12));
  const baseSize = Math.min(width, height);
  const scale = Math.min(1, baseSize / 72);
  const barHeight = Math.max(5, Math.round(baseSize * 0.11 * scale));
  const barPadding = Math.max(3, Math.round(barHeight * 0.2));
  const barGap = 0;
  const barCount = tokenState.attributes?.bars?.length ?? 0;
  const availableBarHeight = height * 0.5;
  const stackDown = barCount > 2;
  const maxBars = stackDown
    ? barCount
    : Math.max(
        1,
        Math.floor((availableBarHeight + barGap) / (barHeight + barGap))
      );
  const barsToShowCount = Math.min(barCount, maxBars);
  const baseBarY = height - barPadding - barHeight;
  const bottomBarY =
    barsToShowCount > 0
      ? stackDown
        ? baseBarY + (barsToShowCount - 1) * (barHeight + barGap)
        : baseBarY
      : null;
  const labelGap = Math.max(2, Math.round(barHeight * 0.35));
  const defaultLabelY =
    height - (defaultFontSize * fontScale + paddingY) / 2 + overlayOffset;
  const labelY =
    bottomBarY !== null
      ? bottomBarY + barHeight + labelGap + paddingY / 2
      : defaultLabelY;

  return (
    <Group y={labelY}>
      <Rect
        y={-paddingY / 2}
        width={rectWidth}
        offsetX={width / 2}
        x={width - rectWidth / 2}
        height={defaultFontSize * fontScale + paddingY}
        fill="hsla(230, 25%, 18%, 0.8)"
        cornerRadius={(defaultFontSize * fontScale + paddingY) / 2}
      />
      <Group offsetX={(textWidth - width) / 2}>
        <Text
          ref={textRef}
          text={tokenState.label}
          fontSize={defaultFontSize}
          lineHeight={1}
          // Scale font instead of changing font size to avoid kerning issues with Firefox
          scaleX={fontScale}
          scaleY={fontScale}
          fill="white"
          wrap="none"
          ellipsis={false}
          hitFunc={() => {}}
        />
      </Group>
      {/* Use an invisible text block to work out text sizing */}
      <Text
        visible={false}
        ref={textSizerRef}
        text={tokenState.label}
        wrap="none"
      />
    </Group>
  );
}

export default TokenLabel;
