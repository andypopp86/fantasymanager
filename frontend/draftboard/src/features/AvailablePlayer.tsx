import React, {useState} from "react";
import { favoritePlayer } from "../lib/data";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart as solidHeart } from '@fortawesome/free-solid-svg-icons';
import { faHeart as regularHeart } from '@fortawesome/free-regular-svg-icons';
import { faEdit, faWind } from "@fortawesome/free-solid-svg-icons";

interface HeartProps {
    filled: boolean;
    size?: 'sm' | 'lg'; // Optional size prop
  }
  
  const Heart: React.FC<HeartProps> = ({ filled, size }) => {
    const icon = filled ? solidHeart : regularHeart;
    const iconSize = size === 'lg' ? 'lg' : 'sm'; // Default to 'sm' if size is not provided
  
    return (
      <FontAwesomeIcon icon={icon} size={iconSize} color="red" />
    );
  };

export default function AvailablePlayer({pick, setOpenDialog, setNominatedPlayer, handleDragStart, id, draftContext, statField }) {
    function nominatePlayer (pick) {
        setNominatedPlayer(pick);
        setOpenDialog(true);
    }
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
    const postFavorite = (player, favorite) => {
        favoritePlayer(draftContext.draftId, player.player_id, {favorite: favorite}).then((response) => {
            setIsFavorite(response.data["favorite"]);
        });
    }

    const [isFavorite, setIsFavorite] = useState(pick.player.favorite);

    const strengthOfSchedule = getStrengthOfSchedule(pick);
    const scheduleBG = strengthOfSchedule > 25 ? "bg-red-900" : strengthOfSchedule <= 5 ? "bg-green-900" : "bg-yellow-200";
    const scheduleFG = strengthOfSchedule > 25 ? "text-white" : strengthOfSchedule <= 5 ? "text-white" : "text-black";
    const hasTheWind = (pick) => {
        if (!pick.player.team) {
            return false;
        } else if (["QB", "WR", "TE"].includes(pick.player.position)) {
            return pick.player.team.defensive_ranking <= 2;
        } else if (pick.player.position === "RB") {
            return pick.player.team.defensive_ranking >= 4;
        }
        return false;
    }

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
                <td onClick={() => nominatePlayer(pick.player)}>{parseInt(pick.player.adp_price)}</td>
                <td onClick={() => nominatePlayer(pick.player)}>{parseInt(pick.player.adp_price)-parseInt(pick.projected_price)}</td>
                <td className={scheduleBG + " " + scheduleFG}
                    >{strengthOfSchedule}
                </td>
                <td>{parseInt(pick[statField])}</td>
                <td className="bg-white" onClick={() => postFavorite(pick.player, !isFavorite)}>
                    <Heart key={`H${pick.player.player_id}`} filled={isFavorite} size="sm"/>
                </td>
                <td className="bg-white" title={pick.player.notes}>
                    {pick.player.notes &&
                    <FontAwesomeIcon icon={faEdit} size="sm" color="blue" />
                    }
                </td>
                <td className="bg-white">
                    {hasTheWind(pick) &&
                    <FontAwesomeIcon icon={faWind} size="sm" color="blue" />
                    }
                </td>
            </tr>
        )}
        </>
    )
}