DARK_GREEN = 'rgb(0, 100, 0)'
LIGHT_GREEN = 'rgb(154, 205, 50)'
LIGHT_YELLOW = 'rgb(210, 210, 80)'
ORANGE = 'rgb(255, 164, 0)'
RED = 'rgb(255, 0, 0)'
GREY = 'rgb(210, 210, 210)'

GENERIC_RANK_COLORS = {
    0: 'rgb(0, 0, 0)',
    1: DARK_GREEN,
    2: DARK_GREEN,
    3: DARK_GREEN,
    4: DARK_GREEN,
    5: DARK_GREEN,
    6: DARK_GREEN,
    7: LIGHT_GREEN,
    8: LIGHT_GREEN,
    9: LIGHT_GREEN,
    10: LIGHT_GREEN,
    11: LIGHT_GREEN,
    12: LIGHT_GREEN,
    13: LIGHT_YELLOW,
    14: LIGHT_YELLOW,
    15: LIGHT_YELLOW,
    16: LIGHT_YELLOW,
    17: LIGHT_YELLOW,
    18: LIGHT_YELLOW,
    19: LIGHT_YELLOW,
    20: LIGHT_YELLOW,
    21: ORANGE,
    22: ORANGE,
    23: ORANGE,
    24: ORANGE,
    25: ORANGE,
    26: ORANGE,
    27: RED,
    28: RED,
    29: RED,
    30: RED,
    31: RED,
    32: RED,
}

STOPLIGHT_COLORS = {
    0: 'rgb(0, 0, 0)',
    1: DARK_GREEN,
    2: LIGHT_GREEN,
    3: LIGHT_YELLOW,
    4: ORANGE,
    5: RED,
    100: GREY,
}

def weather_rank_to_quint(rank):
    if rank >= 1 and rank <= 5:
        return rank
    elif rank > 5:
        return 5

def team_rank_to_quint(rank):
    if rank == 0:
        return 5
    elif rank <= 5:
        return 1
    elif rank <= 12:
        return 2
    elif rank <=20:
        return 3
    elif rank <= 25:
        return 4
    else:
        return 5
