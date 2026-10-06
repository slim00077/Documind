import { useEffect, useRef } from "react";
import "./AnimatedBackground.css";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  phase: number;
};

type FloatingIcon = {
  x: number;
  y: number;
  size: number;
  type: number;
  color: string;
  alpha: number;
  rotation: number;
  phase: number;
  speed: number;
};

const COLORS = [
  "#3B82F6", // blue
  "#06B6D4", // cyan
  "#6366F1", // indigo
  "#8B5CF6", // purple
  "#A855F7", // violet
  "#EC4899", // pink
  "#14B8A6", // teal
  "#F59E0B", // amber
];

export default function AnimatedBackground() {
  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas =
      canvasRef.current;

    if (!canvas) return;

    const ctx =
      canvas.getContext("2d");

    if (!ctx) return;

    let width = 0;
    let height = 0;

    let animationFrame = 0;

    let particles: Particle[] = [];
    let icons: FloatingIcon[] = [];

    const mouse = {
      x: -1000,
      y: -1000,
      active: false,
    };

    /*
    =========================================================
    RESIZE
    =========================================================
    */

    const resize = () => {
      const rect =
        canvas.getBoundingClientRect();

      width = rect.width;
      height = rect.height;

      const dpr =
        Math.min(
          window.devicePixelRatio || 1,
          2
        );

      canvas.width =
        Math.floor(width * dpr);

      canvas.height =
        Math.floor(height * dpr);

      ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );

      createScene();
    };

    /*
    =========================================================
    CREATE SCENE
    =========================================================
    */

    const createScene = () => {
      /*
      ---------------------------------------------------------
      SMALL COLORFUL DOTS
      ---------------------------------------------------------
      */

      particles = [];

      const particleCount =
        width < 700 ? 50 : 140;

      for (
        let i = 0;
        i < particleCount;
        i++
      ) {
        particles.push({
          x:
            Math.random() *
            width,

          y:
            Math.random() *
            height,

          vx:
            (Math.random() - 0.5) *
            0.12,

          vy:
            (Math.random() - 0.5) *
            0.12,

          size:
            1 +
            Math.random() * 2.2,

          color:
            COLORS[
              Math.floor(
                Math.random() *
                  COLORS.length
              )
            ],

          alpha:
            0.15 +
            Math.random() * 0.45,

          phase:
            Math.random() *
            Math.PI *
            2,
        });
      }

      /*
      ---------------------------------------------------------
      FLOATING ICONS
      ---------------------------------------------------------

      Icons are deliberately spread across
      the complete screen.
      */

      icons = [];

      const positions = [
        // Top
        [0.08, 0.12],
        [0.20, 0.20],
        [0.34, 0.10],
        [0.48, 0.18],
        [0.62, 0.09],
        [0.76, 0.18],
        [0.90, 0.10],

        // Middle
        [0.06, 0.42],
        [0.19, 0.52],
        [0.83, 0.40],
        [0.94, 0.52],

        // Lower
        [0.08, 0.72],
        [0.25, 0.84],
        [0.42, 0.75],
        [0.58, 0.87],
        [0.75, 0.73],
        [0.91, 0.84],
      ];

      positions.forEach(
        ([px, py], index) => {
          icons.push({
            x:
              width * px,

            y:
              height * py,

            size:
              28 +
              Math.random() * 20,

            /*
            0 PDF
            1 Word
            2 Generic document
            3 Folder
            4 Cloud
            5 Search
            6 Analytics
            7 Database
            8 Security
            9 Image
            */

            type:
              index % 10,

            color:
              COLORS[
                index %
                  COLORS.length
              ],

            alpha:
              0.16 +
              Math.random() * 0.13,

            rotation:
              (Math.random() - 0.5) *
              0.20,

            phase:
              Math.random() *
              Math.PI *
              2,

            speed:
              0.12 +
              Math.random() * 0.20,
          });
        }
      );
    };

    /*
    =========================================================
    GET ICON MOUSE INTERACTION
    =========================================================
    */

    const getIconInteraction = (
      icon: FloatingIcon
    ) => {
      const dx =
        mouse.x - icon.x;

      const dy =
        mouse.y - icon.y;

      const distance =
        Math.sqrt(
          dx * dx +
            dy * dy
        );

      const interactionRadius =
        150;

      if (
        !mouse.active ||
        distance >
          interactionRadius
      ) {
        return {
          strength: 0,
          distance,
          dx,
          dy,
        };
      }

      const strength =
        1 -
        distance /
          interactionRadius;

      return {
        strength,
        distance,
        dx,
        dy,
      };
    };

    /*
    =========================================================
    DRAW ICON
    =========================================================
    */

    const drawIcon = (
      icon: FloatingIcon,
      time: number
    ) => {
      /*
      Natural floating movement.
      */

      const floatX =
        Math.sin(
          time *
            icon.speed +
            icon.phase
        ) * 4;

      const floatY =
        Math.cos(
          time *
            icon.speed *
            0.8 +
            icon.phase
        ) * 7;

      /*
      Mouse interaction.
      */

      const interaction =
        getIconInteraction(
          icon
        );

      let x =
        icon.x +
        floatX;

      let y =
        icon.y +
        floatY;

      /*
      Push icon slightly away
      from the cursor.
      */

      if (
        interaction.strength >
        0
      ) {
        const distance =
          interaction.distance ||
          1;

        const push =
          interaction.strength *
          22;

        x -=
          (interaction.dx /
            distance) *
          push;

        y -=
          (interaction.dy /
            distance) *
          push;
      }

      /*
      Scale when mouse approaches.
      */

      const scale =
        1 +
        interaction.strength *
        0.28;

      /*
      Rotation reaction.
      */

      const rotation =
        icon.rotation +
        Math.sin(
          time * 1.5
        ) *
        0.02 +
        interaction.strength *
        0.12;

      /*
      Stronger opacity.
      */

      const alpha =
        icon.alpha +
        interaction.strength *
        0.35;

      const size =
        icon.size *
        scale;

      /*
      Glow intensity.
      */

      ctx.save();

      ctx.translate(
        x,
        y
      );

      ctx.rotate(
        rotation
      );

      ctx.shadowColor =
        icon.color;

      ctx.shadowBlur =
        10 +
        interaction.strength *
          30;

      /*
      Soft halo behind the icon.
      */

      if (
        interaction.strength >
        0
      ) {
        const halo =
          ctx.createRadialGradient(
            0,
            0,
            2,
            0,
            0,
            size * 1.5
          );

        halo.addColorStop(
          0,
          hexToRgba(
            icon.color,
            0.20 *
              interaction.strength
          )
        );

        halo.addColorStop(
          1,
          hexToRgba(
            icon.color,
            0
          )
        );

        ctx.beginPath();

        ctx.arc(
          0,
          0,
          size * 1.5,
          0,
          Math.PI * 2
        );

        ctx.fillStyle =
          halo;

        ctx.fill();
      }

      ctx.strokeStyle =
        hexToRgba(
          icon.color,
          alpha
        );

      ctx.fillStyle =
        "rgba(255,255,255,0.28)";

      ctx.lineWidth =
        1.4 +
        interaction.strength *
          0.7;

      drawIconShape(
        ctx,
        icon.type,
        size
      );

      ctx.restore();

      /*
      ---------------------------------------------------------
      EXTRA SPARKLES AROUND ICON
      ---------------------------------------------------------
      */

      if (
        interaction.strength >
        0.15
      ) {
        drawIconSparkles(
          x,
          y,
          size,
          icon.color,
          interaction.strength,
          time
        );
      }
    };

    /*
    =========================================================
    DRAW ICON SHAPES
    =========================================================
    */

    const drawIconShape = (
      ctx: CanvasRenderingContext2D,
      type: number,
      size: number
    ) => {
      switch (type) {
        case 0:
          drawPdf(
            ctx,
            size
          );
          break;

        case 1:
          drawWord(
            ctx,
            size
          );
          break;

        case 2:
          drawDocument(
            ctx,
            size
          );
          break;

        case 3:
          drawFolder(
            ctx,
            size
          );
          break;

        case 4:
          drawCloud(
            ctx,
            size
          );
          break;

        case 5:
          drawSearch(
            ctx,
            size
          );
          break;

        case 6:
          drawAnalytics(
            ctx,
            size
          );
          break;

        case 7:
          drawDatabase(
            ctx,
            size
          );
          break;

        case 8:
          drawSecurity(
            ctx,
            size
          );
          break;

        case 9:
          drawImage(
            ctx,
            size
          );
          break;
      }
    };

    /*
    =========================================================
    DOCUMENT ICONS
    =========================================================
    */

    const drawDocument = (
      ctx: CanvasRenderingContext2D,
      size: number
    ) => {
      const w =
        size * 0.68;

      const h =
        size * 0.9;

      ctx.beginPath();

      ctx.roundRect(
        -w / 2,
        -h / 2,
        w,
        h,
        6
      );

      ctx.fill();

      ctx.stroke();

      /*
      Folded corner.
      */

      ctx.beginPath();

      ctx.moveTo(
        w / 2 - 11,
        -h / 2
      );

      ctx.lineTo(
        w / 2,
        -h / 2 + 11
      );

      ctx.lineTo(
        w / 2 - 11,
        -h / 2 + 11
      );

      ctx.closePath();

      ctx.stroke();

      /*
      Text lines.
      */

      for (
        let i = 0;
        i < 3;
        i++
      ) {
        ctx.beginPath();

        ctx.moveTo(
          -w / 2 + 7,
          -h / 2 +
            20 +
            i * 7
        );

        ctx.lineTo(
          w / 2 - 7,
          -h / 2 +
            20 +
            i * 7
        );

        ctx.stroke();
      }
    };

    const drawPdf = (
      ctx: CanvasRenderingContext2D,
      size: number
    ) => {
      drawDocument(
        ctx,
        size
      );

      ctx.font =
        `bold ${size * 0.20}px Arial`;

      ctx.textAlign =
        "center";

      ctx.textBaseline =
        "middle";

      ctx.fillStyle =
        "rgba(255,255,255,0.75)";

      ctx.fillText(
        "PDF",
        0,
        size * 0.22
      );
    };

    const drawWord = (
      ctx: CanvasRenderingContext2D,
      size: number
    ) => {
      drawDocument(
        ctx,
        size
      );

      ctx.font =
        `bold ${size * 0.30}px Arial`;

      ctx.textAlign =
        "center";

      ctx.textBaseline =
        "middle";

      ctx.fillStyle =
        "rgba(255,255,255,0.8)";

      ctx.fillText(
        "W",
        0,
        1
      );
    };

    /*
    =========================================================
    FOLDER
    =========================================================
    */

    const drawFolder = (
      ctx: CanvasRenderingContext2D,
      size: number
    ) => {
      const w =
        size * 0.95;

      const h =
        size * 0.62;

      ctx.beginPath();

      ctx.roundRect(
        -w / 2,
        -h / 2,
        w,
        h,
        5
      );

      ctx.fill();

      ctx.stroke();

      ctx.beginPath();

      ctx.moveTo(
        -w / 2,
        -h / 2
      );

      ctx.lineTo(
        -w * 0.18,
        -h / 2
      );

      ctx.lineTo(
        -w * 0.04,
        -h * 0.22
      );

      ctx.lineTo(
        w / 2,
        -h * 0.22
      );

      ctx.stroke();
    };

    /*
    =========================================================
    CLOUD
    =========================================================
    */

    const drawCloud = (
      ctx: CanvasRenderingContext2D,
      size: number
    ) => {
      ctx.beginPath();

      ctx.arc(
        -size * 0.20,
        0,
        size * 0.22,
        0,
        Math.PI * 2
      );

      ctx.arc(
        0,
        -size * 0.10,
        size * 0.30,
        0,
        Math.PI * 2
      );

      ctx.arc(
        size * 0.22,
        0,
        size * 0.22,
        0,
        Math.PI * 2
      );

      ctx.moveTo(
        -size * 0.42,
        size * 0.18
      );

      ctx.lineTo(
        size * 0.43,
        size * 0.18
      );

      ctx.stroke();
    };

    /*
    =========================================================
    SEARCH
    =========================================================
    */

    const drawSearch = (
      ctx: CanvasRenderingContext2D,
      size: number
    ) => {
      ctx.beginPath();

      ctx.arc(
        -size * 0.10,
        -size * 0.10,
        size * 0.25,
        0,
        Math.PI * 2
      );

      ctx.stroke();

      ctx.beginPath();

      ctx.moveTo(
        size * 0.08,
        size * 0.08
      );

      ctx.lineTo(
        size * 0.32,
        size * 0.32
      );

      ctx.stroke();
    };

    /*
    =========================================================
    ANALYTICS
    =========================================================
    */

    const drawAnalytics = (
      ctx: CanvasRenderingContext2D,
      size: number
    ) => {
      ctx.beginPath();

      ctx.moveTo(
        -size * 0.36,
        size * 0.30
      );

      ctx.lineTo(
        -size * 0.18,
        0
      );

      ctx.lineTo(
        0,
        size * 0.12
      );

      ctx.lineTo(
        size * 0.34,
        -size * 0.30
      );

      ctx.stroke();

      /*
      Small points.
      */

      [
        [-0.36, 0.30],
        [-0.18, 0],
        [0, 0.12],
        [0.34, -0.30],
      ].forEach(
        ([x, y]) => {
          ctx.beginPath();

          ctx.arc(
            size * x,
            size * y,
            2,
            0,
            Math.PI * 2
          );

          ctx.fill();
        }
      );
    };

    /*
    =========================================================
    DATABASE
    =========================================================
    */

    const drawDatabase = (
      ctx: CanvasRenderingContext2D,
      size: number
    ) => {
      ctx.beginPath();

      ctx.ellipse(
        0,
        -size * 0.25,
        size * 0.30,
        size * 0.12,
        0,
        0,
        Math.PI * 2
      );

      ctx.stroke();

      ctx.beginPath();

      ctx.moveTo(
        -size * 0.30,
        -size * 0.25
      );

      ctx.lineTo(
        -size * 0.30,
        size * 0.28
      );

      ctx.stroke();

      ctx.beginPath();

      ctx.moveTo(
        size * 0.30,
        -size * 0.25
      );

      ctx.lineTo(
        size * 0.30,
        size * 0.28
      );

      ctx.stroke();

      ctx.beginPath();

      ctx.ellipse(
        0,
        size * 0.28,
        size * 0.30,
        size * 0.12,
        0,
        0,
        Math.PI * 2
      );

      ctx.stroke();
    };

    /*
    =========================================================
    SECURITY
    =========================================================
    */

    const drawSecurity = (
      ctx: CanvasRenderingContext2D,
      size: number
    ) => {
      /*
      Lock body.
      */

      ctx.beginPath();

      ctx.roundRect(
        -size * 0.28,
        -size * 0.02,
        size * 0.56,
        size * 0.40,
        5
      );

      ctx.fill();

      ctx.stroke();

      /*
      Lock arc.
      */

      ctx.beginPath();

      ctx.arc(
        0,
        -size * 0.02,
        size * 0.22,
        Math.PI,
        0
      );

      ctx.stroke();
    };

    /*
    =========================================================
    IMAGE
    =========================================================
    */

    const drawImage = (
      ctx: CanvasRenderingContext2D,
      size: number
    ) => {
      const w =
        size * 0.72;

      const h =
        size * 0.55;

      ctx.beginPath();

      ctx.roundRect(
        -w / 2,
        -h / 2,
        w,
        h,
        5
      );

      ctx.stroke();

      /*
      Sun.
      */

      ctx.beginPath();

      ctx.arc(
        size * 0.16,
        -size * 0.12,
        size * 0.07,
        0,
        Math.PI * 2
      );

      ctx.stroke();

      /*
      Mountain.
      */

      ctx.beginPath();

      ctx.moveTo(
        -w * 0.35,
        h * 0.28
      );

      ctx.lineTo(
        -size * 0.02,
        0
      );

      ctx.lineTo(
        size * 0.18,
        h * 0.20
      );

      ctx.stroke();
    };

    /*
    =========================================================
    ICON SPARKLES
    =========================================================
    */

    const drawIconSparkles = (
      x: number,
      y: number,
      size: number,
      color: string,
      strength: number,
      time: number
    ) => {
      const sparkleCount = 5;

      for (
        let i = 0;
        i < sparkleCount;
        i++
      ) {
        const angle =
          (i /
            sparkleCount) *
            Math.PI *
            2 +
          time * 0.5;

        const distance =
          size *
          (0.8 +
            strength *
              0.8);

        const sx =
          x +
          Math.cos(angle) *
            distance;

        const sy =
          y +
          Math.sin(angle) *
            distance;

        const sparkleSize =
          1.2 +
          strength * 2;

        ctx.beginPath();

        ctx.arc(
          sx,
          sy,
          sparkleSize,
          0,
          Math.PI * 2
        );

        ctx.fillStyle =
          hexToRgba(
            color,
            0.2 +
              strength *
                0.6
          );

        ctx.shadowColor =
          color;

        ctx.shadowBlur = 10;

        ctx.fill();

        ctx.shadowBlur = 0;
      }
    };

    /*
    =========================================================
    PARTICLES
    =========================================================
    */

    const drawParticles = (
      time: number
    ) => {
      particles.forEach(
        (particle) => {
          particle.x +=
            particle.vx;

          particle.y +=
            particle.vy;

          /*
          Mouse interaction.
          */

          if (mouse.active) {
            const dx =
              particle.x -
              mouse.x;

            const dy =
              particle.y -
              mouse.y;

            const distance =
              Math.sqrt(
                dx * dx +
                  dy * dy
              );

            const radius =
              130;

            if (
              distance <
              radius
            ) {
              const strength =
                1 -
                distance /
                  radius;

              /*
              Push away from cursor.
              */

              particle.x +=
                (dx /
                  (distance ||
                    1)) *
                strength *
                1.4;

              particle.y +=
                (dy /
                  (distance ||
                    1)) *
                strength *
                1.4;
            }
          }

          /*
          Wrap around.
          */

          if (
            particle.x <
            -10
          ) {
            particle.x =
              width + 10;
          }

          if (
            particle.x >
            width + 10
          ) {
            particle.x = -10;
          }

          if (
            particle.y <
            -10
          ) {
            particle.y =
              height + 10;
          }

          if (
            particle.y >
            height + 10
          ) {
            particle.y = -10;
          }

          /*
          Pulsing.
          */

          const pulse =
            0.65 +
            Math.sin(
              time *
                0.002 +
                particle.phase
            ) *
            0.35;

          ctx.beginPath();

          ctx.arc(
            particle.x,
            particle.y,
            particle.size *
              pulse,
            0,
            Math.PI * 2
          );

          ctx.fillStyle =
            hexToRgba(
              particle.color,
              particle.alpha
            );

          ctx.shadowColor =
            particle.color;

          ctx.shadowBlur = 8;

          ctx.fill();

          ctx.shadowBlur = 0;
        }
      );
    };

    /*
    =========================================================
    RENDER
    =========================================================
    */

    const render = (
      timestamp: number
    ) => {
      ctx.clearRect(
        0,
        0,
        width,
        height
      );

      /*
      Dots first.
      */

      drawParticles(
        timestamp
      );

      /*
      Icons on top.
      */

      icons.forEach(
        (icon) => {
          drawIcon(
            icon,
            timestamp / 1000
          );
        }
      );

      animationFrame =
        requestAnimationFrame(
          render
        );
    };

    /*
    =========================================================
    MOUSE
    =========================================================
    */

    const handleMouseMove = (
      event: MouseEvent
    ) => {
      const rect =
        canvas.getBoundingClientRect();

      mouse.x =
        event.clientX -
        rect.left;

      mouse.y =
        event.clientY -
        rect.top;

      mouse.active = true;
    };

    const handleMouseLeave = () => {
      mouse.active = false;

      mouse.x = -1000;
      mouse.y = -1000;
    };

    /*
    =========================================================
    START
    =========================================================
    */

    resize();

    window.addEventListener(
      "resize",
      resize
    );

    window.addEventListener(
      "mousemove",
      handleMouseMove
    );

    window.addEventListener(
      "mouseleave",
      handleMouseLeave
    );

    animationFrame =
      requestAnimationFrame(
        render
      );

    /*
    =========================================================
    CLEANUP
    =========================================================
    */

    return () => {
      cancelAnimationFrame(
        animationFrame
      );

      window.removeEventListener(
        "resize",
        resize
      );

      window.removeEventListener(
        "mousemove",
        handleMouseMove
      );

      window.removeEventListener(
        "mouseleave",
        handleMouseLeave
      );
    };
  }, []);

  return (
    <div
      className="documind-background"
      aria-hidden="true"
    >
      <div className="background-base" />

      <canvas
        ref={canvasRef}
        className="background-canvas"
      />
    </div>
  );
}

/*
=========================================================
HEX → RGBA
=========================================================
*/

function hexToRgba(
  hex: string,
  alpha: number
) {
  const clean =
    hex.replace("#", "");

  const value =
    parseInt(
      clean,
      16
    );

  const r =
    (value >> 16) & 255;

  const g =
    (value >> 8) & 255;

  const b =
    value & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}