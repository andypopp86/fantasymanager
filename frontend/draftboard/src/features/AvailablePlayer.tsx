import React from "react";
import { setFavorite } from "../lib/mutations";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart as solidHeart, faHeartCrack } from '@fortawesome/free-solid-svg-icons';
import { faHeart as regularHeart } from '@fortawesome/free-regular-svg-icons';

interface HeartProps {
    favorite: boolean | null | undefined; // true = target, null = neutral, false = avoid
    size?: 'sm' | 'lg'; // Optional size prop
  }

  const Heart: React.FC<HeartProps> = ({ favorite, size }) => {
    const icon = favorite ? solidHeart : favorite === false ? faHeartCrack : regularHeart;
    const color = favorite === false ? "#6b7280" : "red";
    const iconSize = size === 'lg' ? 'lg' : 'sm'; // Default to 'sm' if size is not provided

    return (
      <FontAwesomeIcon icon={icon} size={iconSize} color={color} />
    );
  };

export default function AvailablePlayer({pick, nominatePlayer, handleDragStart, id, draftContext, draftSend, statField }) {
    const handleDrag = (e) => {
        e.preventDefault();
    };
    const getStrengthOfSchedule = (pick) => {
        const fieldName = `early_season_${pick.player.position.toLowerCase()}`;
        if (pick.player.team) {
            return pick.player.team[fieldName];
        }
        return 1000;
    }
    // The mutation cycles the tri-state (neutral -> target -> avoid) and
    // updates the Dexie row, so the Favorite filter sees hearts cycled this
    // session; the row's live query re-renders this component.
    const postFavorite = (player) => {
        setFavorite(draftContext.draftId, player.player_id);
    }

    const strengthOfSchedule = getStrengthOfSchedule(pick);
    const scheduleBG = strengthOfSchedule > 25 ? "bg-red-900" : strengthOfSchedule <= 5 ? "bg-green-900" : "bg-yellow-200";
    const scheduleFG = strengthOfSchedule > 25 ? "text-white" : strengthOfSchedule <= 5 ? "text-white" : "text-black";

    return (
        <>
        {pick && (
            <tr key={pick.player.player_id} className="font-small" style={
                {background: POSITION_BG_COLORS[pick.player.position], color: POSITION_FG_COLORS[pick.player.position]}
                }
                draggable="true" onDrag={handleDrag} onDragStart={(e) => handleDragStart(e, pick.player.player_id)}
                >
                <td onClick={() => nominatePlayer(pick.player)}>{pick.player.name}</td>
                <td onClick={() => nominatePlayer(pick.player)}>{pick.player.position}</td>
                <td onClick={() => nominatePlayer(pick.player)}>{parseInt(pick.projected_price)}</td>
                {/* Unused for the 2026 draft; matching headers are commented out in AvailablePlayers.tsx
                <td onClick={() => nominatePlayer(pick.player)}>{parseInt(pick.player.adp_price)}</td>
                <td onClick={() => nominatePlayer(pick.player)}>{parseInt(pick.player.adp_price)-parseInt(pick.projected_price)}</td>
                <td className={scheduleBG + " " + scheduleFG}
                    >{strengthOfSchedule}
                </td>
                <td>{parseInt(pick[statField])}</td>
                */}
                <td className="bg-white" onClick={() => postFavorite(pick.player)}>
                    <Heart key={`H${pick.player.player_id}`} favorite={pick.player.favorite} size="sm"/>
                </td>
            </tr>
        )}
        </>
    )
}