import { IconButton, IconButtonProps } from "theme-ui";

type RadioButttonProps = {
  isSelected: boolean;
} & IconButtonProps;

function RadioIconButton({
  title,
  onClick,
  isSelected,
  disabled,
  children,
  sx,
  ...props
}: RadioButttonProps) {
  return (
    <IconButton
      aria-label={title}
      title={title}
      onClick={onClick}
      sx={{ color: isSelected ? "primary" : "text", ...(sx || {}) }}
      disabled={disabled}
      {...props}
    >
      {children}
    </IconButton>
  );
}

RadioIconButton.defaultProps = {
  disabled: false,
};

export default RadioIconButton;
