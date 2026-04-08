import { useTimeline } from "@opentui/react";
import { useEffect, useState } from "react";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const Spinner = () => {
  const timeline = useTimeline({ loop: true });
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const target = { value: 0 };

    timeline.add(target, {
      value: frames.length,
      duration: frames.length * 80,
      ease: "linear",
      loop: true,
      onUpdate: (animation) => {
        setFrame(Math.floor(animation.targets[0].value) % frames.length);
      },
    });
  }, [timeline]);

  return <text>{frames[frame]}</text>;
};
