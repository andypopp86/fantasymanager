class GlobalState {
    state = {}
    subscribers = {}
    static vars = {

    }

    set({key, value}) {
        const oldValue = this.state[key];
        this.state[key] = value;
        this.notify(key, value, oldValue);
        return this.state[key];
    }

    get(key) {
        if (!Object.prototype.hasOwnProperty.call(this.state, key)) {
            console.warn(`GlobalState: Key ${key} does not exist`);
        }
        return this.state[key];
    }

    subscribe({key, callback}) {
        if (!Object.prototype.hasOwnProperty.call(this.state, key)) {
            this.subscribers[key] = [];
        }
        this.subscribers[key].push(callback);
    }

    notify(key, value, oldValue) {
        if (Object.prototype.hasOwnProperty.call(this.subscribers, key)) {
            this.subscribers[key].forEach((callback) => {
                callback({key, value, oldValue});
            })
        }
    }
}

const globalState = new GlobalState();

function initializeGlobalState(data) {
    var jsonData = JSON.parse(data);
    globalState.set({key: 'draft_id', value: jsonData.data.draft_id});
    globalState.set({key: 'drafter_id', value: jsonData.data.drafter_id});    
}

function lockDraftBoardHeader() {
    let header = document.getElementById('draft-board-header');
    let stickyTop = header.offsetTop;
    if (window.pageYOffset > stickyTop) {
        header.classList.add("sticky");
      } else {
        header.classList.remove("sticky");
      }
}

function submitNotes() {
    let notes = $('#draft-notes').val();
    let draftId = getDraftId();
    let notesUrl = `/draft/notes/${draftId}/`
    $.ajax({
        url: notesUrl,
        datatype: 'json',
        type: 'POST',
        data: {
            csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken').val(),
            notes
        },
        success: function(data) {
        }
    })
}

function startDraftBoard() {
    let draft_id = $('#id_current_draft').attr('current_draft_id')
    $.ajax({
        url: `/draft/board/${draft_id}/json`,
        datatype: 'json',
        type: 'GET',
        data: {
            draft_id: draft_id
        },
        success: function(data) {
            jsonData = JSON.parse(data);
            updateDraftBoard(data);
            updateProjectedTeam(jsonData);
            initializeGlobalState(data);
            $('input.skepticism').change(setSkepticismRating);
            $('#ap-filter-player').keyup(applyFilters);
            $('#ap-filter-position').keyup(applyFilters);
            $('#ap-filter-price').keyup(applyFilters);
            $('#ap-filter-weather').keyup(applyFilters);
            $('#ap-filter-schedule').keyup(applyFilters);
            $('#ap-filter-oline-ranking').keyup(applyFilters);
            $('#ap-filter-skepticism').keyup(applyFilters);
            $('#ap-filter-offensive-support').keyup(applyFilters);
            $('#ap-filter-favorite').change(applyFilters);
            $('#ap-filter-budget').change(applyFilters);
            $('#ap-filter-clear').click(clearFilters);
            $('.toggle-favorite').click(toggleFavoritePlayer);
            $('#draft-notes').focusout(submitNotes)
        }
    })

}
function handlePickClick(e, action) {  
    if(action === 'draft') {
        draftPlayer(e);
        $('#id_draft_current_manager').focus();
    } else if(action === 'watch') {
        watchPlayer(e);
    } else if (action === 'unwatch') {
        unwatchPlayer(e)
    } else if (action === 'undraft') {
        undraftPlayer(e);
    } else if (action == 'budget') {
        budgetPlayer(e);
    } else if (action == 'unbudget') {
        unbudgetPlayer(e);
    }
}


function watchPlayer(e) {
    const $player = $(e).parent();
    let [current_act_price, curr_proj_price, current_player_id, draft_id, drafter_id, current_manager_id, submit_position, current_player_name] = getSubmitData();
    let [position, player_id, proj_price, round_price, player_name, managerId] = extractTargetData($player);

    let watchPlayerUrl = `/draft/watch_player/${draft_id}/${player_id}/`
    let watchPlayerRequest = $.post(
        watchPlayerUrl,
        {
            csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken').val()
            ,manager_id: current_manager_id 
        },
        function(data) {
            let jsonData = JSON.parse(data);
            if (jsonData.status == 'watched') {
                let $lastRow = $('#watch-list tr:last')
                let $watchRow = $(`<tr player_id="${player_id}"></tr>`)
                $('<td></td>').text(player_name).appendTo($watchRow);
                $('<td class="text-danger text-center" style="cursor: pointer;" onclick="unwatchPlayer(this);">&#10006;</td>').appendTo($watchRow);
                $('<td></td>').text(proj_price).appendTo($watchRow);
                $watchRow.insertAfter($lastRow);
            }
        }
    )
}

function setCurrentPlayerData(player_id, position, player_name, proj_price) {
    let $current = $('#id_current_player');
    $current.attr('current_player_id', player_id)
    $current.attr('current_player_position', position)
    $current.attr('current_player_name', player_name)
    $current.attr('current_proj_price', proj_price)
}

function extractTargetData($target) {
    let position = $target.attr('position');
    let player_id = $target.attr('player_id');
    let proj_price = $target.attr('proj-price');
    let round_price = Math.round(proj_price);
    let player_name = $target.find(">:first-child").text();
    let managerId = $target.attr('manager-id')
    return [position, player_id, proj_price, round_price, player_name, managerId]
}

function openDraftModal() {
    $('#draft_player_modal').show()
    $('#draft_player_modal').modal({backdrop: 'static'})
    $('body').removeClass('modal-open');
    $('#id_draft_current_manager').focus()
}

function draftPlayer(e) {
    const $player = $(e).parent();
    updateModalIcons($player);
    $('.available-player').removeClass('drafting');
    $player.addClass('drafting');
    let [position, player_id, proj_price, round_price, player_name, managerId] = extractTargetData($player);
    $('.menu-control').hide();
    $('#menu-control-draft').show();
    $('#draft-player-header').text(player_name);

    let matchFound = false;
    $('.my-proj-team').find('tr').each((idx, row) => {
        let $row = $(row);
        let projName = $row.find('td:nth-child(2)').find('span:nth-child(2)').text();
        if (player_name == projName) {
            matchFound = true;
        }
    });
    $('.star-icon').toggle(matchFound);

    $('#id_draft_current_manager').val('')
    $('#id_current_price').val('')

    setCurrentPlayerData(player_id, position, player_name, proj_price);
    $('#id_draft_current_manager').find('option').first()[0].selected = true;
    $('#id_current_price').val(round_price);
    $('#id_current_position').val(position);

    openDraftModal();
}

function undraftPlayer(e) {
    const $player = $(e).parent();

    $('.menu-control').hide();
    $('#menu-control-undraft').show();
    $('.drafted-player').removeClass('undrafting');
    $player.addClass('undrafting');
    
    let [current_act_price, curr_proj_price, current_player_id, draft_id, drafter_id, current_manager_id, submit_position, current_player_name] = getSubmitData();
    let [position, player_id, proj_price, round_price, player_name, managerId] = extractTargetData($player);
    setCurrentPlayerData(player_id, position, player_name, proj_price);
    $('.menu-control').hide();
    $('#menu-control-undraft').show();

    let undraftPlayerUrl = `/draft/undraft_player/${draft_id}/${player_id}/`
    $.post(
        undraftPlayerUrl,
        {
            csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken').val(),
            managerId: managerId
        },
        function(data) {
            jsonData = JSON.parse(data);
            if (jsonData.undrafted) {
                $(`#available-player-${jsonData.player_id}`).show();
                let $draftedPlayer = $(`#drafted-player-${jsonData.player_id}`);
                $draftedPlayer.find('.pick-price').text('0');
                let managerId = $draftedPlayer.attr('manager-id');
                
                $draftedPlayer.hide();
                $(`#manager-budget-${managerId}`).text(jsonData['updated_budget'])
                $draftedPlayer.attr('manager-id', '');

                let $boardPlayer = $(`#draft-board-player-${jsonData.player_id}`);
                $boardPlayer.removeClass(`position-${jsonData.position}`);
                $boardPlayer.text('($)');

                if (jsonData.new_projected_team) {
                    updateProjectedTeam(jsonData);
                }

            }
            }
    )
}

function unbudgetPlayer(e) {
    const $playerRow = $(e.target).parent().parent();
    $playerRow.addClass('unbudgeting');
    let [current_act_price, curr_proj_price, current_player_id, draft_id, drafter_id, current_manager_id, submit_position, current_player_name] = getSubmitData();
    let player_id = $playerRow.attr('budget-player-id');
    let undraftPlayerUrl = `/draft/unbudget_player/${draft_id}/${player_id}/`
    $.post(
        undraftPlayerUrl,
        {
            csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken').val(),
        },
        function(data) {
            jsonData = JSON.parse(data);
            if (jsonData.status == 'unbudgeted') {
                $playerRow.removeClass('position-QB position-RB position-WR position-TE position-DEF');
                $playerRow.find('td:nth-child(2)').find('span:nth-child(1)').text("⚬");
                $playerRow.find('td:nth-child(2)').find('span:nth-child(2)').text("Unassigned");
                $playerRow.find('td:nth-child(3)').text("-");
                recalculateBudget();

            }
            }
    )
}

function cancelDraftPick(e) {
    $(document).unbind('keypress')
    $('#draft_player_modal').modal({backdrop: false})
    $('#draft_player_modal').hide()
    $('.modal-backdrop').hide()
    $('body').removeClass('modal-open');
}

function cancelUndraftPick(e) {
    $(document).unbind('keypress')
    $('#undraft_player_modal').modal({backdrop: false})
    $('#undraft_player_modal').hide()
    $('.modal-backdrop').hide()
    $('body').removeClass('modal-open');
}

function cancelUnwatchPick(e) {
    $(document).unbind('keypress')
    $('#unwatch_player_modal').modal({backdrop: false})
    $('#unwatch_player_modal').hide()
    $('.modal-backdrop').hide()
    $('body').removeClass('modal-open');
}

function closeDraftModal() {
    $(document).unbind('keypress')
    $('#draft_player_modal').modal({backdrop: false})
    $('#draft_player_modal').hide()
    $('.modal-backdrop').hide()
    $('#draft_player_modal').modal({backdrop: 'static'})
    $('body').removeClass('modal-open');
}

function submitDraftPick(e) {
    let [current_act_price, curr_proj_price, current_player_id, draft_id, drafter_id, current_manager_id, submit_position, current_player_name] = getSubmitData();
    $('#draft-player-header').text("Draft Player");
    closeDraftModal();
    let draftPlayerUrl = `/draft/draft_player/${draft_id}/${current_player_id}/`
    let draftPlayerRequest = $.post(
        draftPlayerUrl,
        {
            csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken').val()
            ,manager_id: current_manager_id 
            ,price: current_act_price.val()
            ,position: submit_position
        },
        function(data) {
            jsonData = JSON.parse(data);
            if (jsonData.status == 'drafted') {
                $(`#available-player-${jsonData.player_id}`).hide();
                let $draftedPlayer = $(`#drafted-player-${jsonData.player_id}`);
                $draftedPlayer.find('.pick-price').text(current_act_price.val());
                $draftedPlayer.attr('manager-id', current_manager_id)
                $draftedPlayer.show();
                $(`#manager-budget-${current_manager_id}`).text(jsonData['updated_budget'])

                if (jsonData.was_drafter == true) {
                    if (jsonData.new_projected_team) {
                        updateProjectedTeam(jsonData);
                    }
                    let playerSelector = `[budget-player-id=${current_player_id}]`
                    let $budgetedPlayerPrice = $(playerSelector).find('.projected-spend')
                    $budgetedPlayerPrice.text(current_act_price.val())       
                    recalculateBudget();
                }
                let $draftSlot = $(`[roundid=${jsonData.mgr_player_ct}][columnid=${jsonData.mgr_position}]`)
                $draftSlot.text(`${current_player_name} ($${current_act_price.val()})`)
                $draftSlot.addClass(`position-${submit_position}`)
                $draftSlot.attr('id', `draft-board-player-${jsonData.player_id}`)
                $(`#draft-board-row-${jsonData.mgr_player_ct}`).show();
                if (jsonData.messages.length >= 1) {
                    alert(jsonData.messages[0])
                }

            } else if (jsonData.status == 'error') {
                alert(jsonData.error)
            }

        }
        
    )

}

function getSubmitData() {
    let current_actual_price = $('#id_current_price').attr('current_price', $('#id_current_price').val())
    let current_proj_price = $('#id_current_player').attr('current_proj_price');
    let current_player_id = $('#id_current_player').attr('current_player_id');
    let draft_id = $('#id_current_draft').attr('current_draft_id')
    let drafter_id = $('#id_drafter').attr('drafter_id')
    let current_manager_id = $('#id_draft_current_manager').find(":selected").attr('manager_id');
    let current_position = $('#id_current_player').attr('current_player_position')
    let current_player_name = $('#id_current_player').attr('current_player_name')
    return [current_actual_price, current_proj_price, current_player_id, draft_id, drafter_id, current_manager_id, current_position, current_player_name]
}

function unwatchPlayer(e) {
    const $player = $(e).parent();
    let [current_act_price, curr_proj_price, current_player_id, draft_id, drafter_id, current_manager_id, submit_position, current_player_name] = getSubmitData();
    let [position, player_id, proj_price, round_price, player_name, managerId] = extractTargetData($player);

    let unwatchPlayerUrl = `/draft/unwatch_player/${draft_id}/${player_id}/`
    let unwatchPlayerRequest = $.post(
        unwatchPlayerUrl,
        {
            csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken').val()
            ,manager_id: current_manager_id 
        },
        function(data) {
            let jsonData = JSON.parse(data);
            if (jsonData.status == 'unwatched') {
                $player.detach();
            }
        }
    )
}

function updateDraftBoard(data) {
    jsonData = JSON.parse(data)
    let draftPicksDict = jsonData['data']['draft_pick_dict']
    let drafter_id = jsonData['data']['drafter_id']
    $('#id_drafter').attr('drafter_id', drafter_id)
    let draft_id = $('#id_current_draft').attr('current_draft_id')
    $.each(draftPicksDict, function(player_id, draftPick) {
        let attr_get_player = `[player_id="${player_id}"`
        let $player_selection = $(attr_get_player)
        let positionClass = `position-${draftPick['position']}`;
        if(draftPick['drafted'] == true) {
            let undraftPlayerUrl = `/draft/undraft_player/${draft_id}/${player_id}/`
            $player_selection.attr('url', undraftPlayerUrl);
        } else {
            let draftPlayerUrl = `/draft/draft_player/${draft_id}/${player_id}/`
            $player_selection.attr('url', draftPlayerUrl);
        }
    }
    )
}

function updateWatchList(data) {
    jsonData = JSON.parse(data);
    let managersDict = jsonData['data']['managers_dict'];
    $.each(managersDict, function(manager_id, manager) {
        let $manager_budget = $(`[manager_budget_id="${manager_id}"`)
        $manager_budget.text(manager['budget'])
    })
}

function addToProjectedTeam(skipModal=false, actualPrice=null, source=null) {

    let player_name = $('#id_current_player').attr('current_player_name')
    let player_id = $('#id_current_player').attr('current_player_id')
    let player_price = $('#id_current_player').attr('current_proj_price')
    let draft_id = $('#id_current_draft').attr('current_draft_id')
    let $current_draft_slot = null;
    $('.menu-control').hide();
    $('#menu-control-proj').show();

    if (source == 'draft') {
        $current_draft_slot = $('#id_draft_player_position').find(":selected");
    } else if (source == 'unwatch') {
        $current_draft_slot = $('#id_unwatch_current_position').find(":selected");
    }
    let current_draft_slot_id = $current_draft_slot.attr('draft_slot_id');
    $('#id_projected_team_current_position').attr('current_position', current_draft_slot_id)
    if (current_draft_slot_id != -1) {
        let $draft_slot = $('#projected-slot-' + current_draft_slot_id);
        let $draft_slot_name = $($draft_slot.children()[0])
        $draft_slot_name.attr('projected-player-id', player_id)
        let $draft_slot_price = $($draft_slot.children()[2])
        $draft_slot_name.text(player_name)
        if (actualPrice) {
            $draft_slot_price.text(actualPrice)
        } else {
            $draft_slot_price.text(player_price)
        }
    }
    let $projectedBudget = $('.projected-budget');
    let $startBudget = $('.start-budget');
    let startTotal = $startBudget.text()

    let $spends = $('.projected-spend');
    $('.projected-spend').each(function(spent) {
        if (!(isNaN($(this).text()))) {
            startTotal -= parseInt($(this).text())
        }
    });
    $projectedBudget.text(startTotal)

    let $targetTeam = $('.target-my-team')
    if (!skipModal) {
        $(document).unbind('keypress')
        $('.modal').modal({backdrop: false})
        $('.modal').hide()
        $('.modal-backdrop').hide()
        $('.modal').modal({backdrop: 'static'})
        $('body').removeClass('modal-open');
    }
    
}

function removeFromProjectedTeam() {
    let player_id = $('#id_current_player').attr('current_player_id')
    let $projectedPlayer = $(`[projected-player-id="${player_id}"]`)
    $projectedPlayer.text('Unassigned')
    $($projectedPlayer.siblings()[1]).text('-')
}


function cancelProjectedTeam(e) {
    $(document).unbind('keypress')
    $('#save_projected_team_modal').modal({backdrop: false})
    $('#save_projected_team_modal').hide()
    $('.modal-backdrop').hide()
    $('body').removeClass('modal-open');
}

function saveProjectedTeam(e) {
    $('#save_projected_team_modal').show()
    $('#save_projected_team_modal').modal({backdrop: 'static'})
    $('body').removeClass('modal-open');
    $('#id_draft_current_manager').focus()
}

function submitProjectedTeam(e) {
    let draft_id = $('#id_current_draft').attr('current_draft_id')
    $(document).unbind('keypress')
    $('#save_projected_team_modal').modal({backdrop: false})
    $('#save_projected_team_modal').hide()
    $('.modal-backdrop').hide()
    $('#save_projected_team_modal').modal({backdrop: 'static'})

    let teamPartsString = getTeamPartsString()

    var saveUrl = `/draft/save_projected_team/${draft_id}/`
    let submitTeamRequest = $.post(
        saveUrl,
        {
            csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken').val()
            ,teamPartsString: teamPartsString
        },
        function(data) {
        }
    )
}


function updateProjectedTeam(jsonData) {
    $('.projected-slot').removeClass('position-QB position-RB position-WR position-TE position-DEF')
    let newTeam = jsonData.new_projected_team;
    for (const newSlot in newTeam) {
        let player = newTeam[newSlot];
        if (player !== null) {
            fillBudgetSlot(player, newSlot);
        } else {
            emptyBudgetSlot(newSlot);
        }
    }
    recalculateBudget();
}

function fillBudgetSlot(player, slot) {
    let $slot = $(`#projected-slot-${slot}`);
    let positionClass = `position-${player.position}`
    let symbol = player.source == 'drafted' ? '✓' : '✖';

    $slot.addClass(positionClass);
    $cancelSpan = $slot.find('td:nth-child(2)').find('span:nth-child(1)');
    $cancelSpan.text(symbol)
    $cancelSpan.addClass('text-danger', 'text-center');
    $cancelSpan.css('cursor', 'pointer');
    $cancelSpan.click(unbudgetPlayer);
    
    $slot.find('span:nth-child(2)').text(player.player);
    $slot.find('.projected-name').prepend($cancelSpan);
    $slot.find('.projected-spend').text(player.price);
    $slot.attr('budget-player-id', player.id);
}

function emptyBudgetSlot(slot) {
    let $slot = $(`#projected-slot-${slot}`);
    $slot.removeClass('position-QB position-RB position-WR position-TE position-DEF');
    $slot.find('td:nth-child(2)').find('span:nth-child(1)').text("⚬");
    $slot.find('td:nth-child(2)').find('span:nth-child(1)').css("color: black");
    $slot.find('td:nth-child(2)').find('span:nth-child(2)').text("Unassigned");
    $slot.find('td:nth-child(3)').text("-");
}

function getTeamPartsString() {
    let teamPartsList = [];
    $('.projected-slot').each(function(slot) {
        let playerPartsList = []
        playerPartsList.push($($(this).children()[0]).text())
        playerPartsList.push($($(this).children()[1]).text())
        playerPartsList.push($($(this).children()[2]).text())
        playerPartsList.push($($(this).children()[0]).attr('projected-player-id'))
        let playerPartsString = playerPartsList.join('~')
        teamPartsList.push(playerPartsString)
    })
    return teamPartsList.join('|')
}

function startPriceBoard() {
    $('.draft-slot').each(function() {
        $(this).on('click', highlightPick)
    })
}

function highlightPick() {
    $(this).toggleClass('pick-selected')
}

function addToPositionSlot(skipModal=false, actualPrice=null, source=null) {

    let player_name = $('#id_current_player').attr('current_player_name')
    $('.menu-control').hide();
    $('#menu-control-slot').show();

    if (source == 'draft') {
        $current_draft_slot = $('#id_draft_player_position').find(":selected");
    } else if (source == 'unwatch') {
        $current_draft_slot = $('#id_unwatch_current_position').find(":selected");
    }
    let current_draft_slot_id = $current_draft_slot.attr('draft_slot_id');

    let $positionSlot = $(`tr[position_options_id="${current_draft_slot_id}`)
    $positionSlot.append($(`<td class='slotted_position'>${player_name}</td>`))

    if (!skipModal) {
        $(document).unbind('keypress')
        $('.modal').modal({backdrop: false})
        $('.modal').hide()
        $('.modal-backdrop').hide()
        $('.modal').modal({backdrop: 'static'})
        $('body').removeClass('modal-open');
    }
}

function savePositionSlots() {
    let draft_id = $('#id_current_draft').attr('current_draft_id')
    let slot_lists = []
    let $positionSlots = $('.position_options')
    $positionSlots.each(function(idx, position) {
        let slot_list = []
        $(this).children('td').each(function(slot_idx, positionSlot) {
            if(slot_idx > 0) {
                slot_list.push($(positionSlot).text())
            }
        });
        slot_lists.push(slot_list);
    })

    for(let i = 0; i < slot_lists.length; i++) {
    }

    var saveUrl = `/draft/save_position_slots/${draft_id}/`
    let submitRequest = $.post(
        saveUrl,
        {
            csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken').val()
            ,slot_lists: slot_lists
        },
        function(data) {
        }
    )
}

function updatePositionSlots(data) {
    jsonData = JSON.parse(data)
    let positionOptionSlots = jsonData['data']['position_option_slots']
    let slots = positionOptionSlots.split('|')
    $.each(slots, function(i, slot) {
        if (slot != 'EMPTY') { 
            let slot_id = `tr[position_options_id=${i}]`
            let $positionSlot = $(slot_id)
            $positionSlot.children('td.slotted_position').remove()
            let slot_players = slot.split('~')
            $.each(slot_players, function(j, player) {
                $positionSlot.append(`<td>${player}</td>`)
            })

        }
    })
}

function budgetPlayer(e) {
    const $player = $(e).parent();
    let [position, player_id, proj_price, round_price, player_name, managerId] = extractTargetData($player);
    let draft_id = globalState.get('draft_id');
    let drafter_id = globalState.get('drafter_id');
    let url = `/draft/budget_player/${draft_id}/${player_id}/`
    if (position != undefined) {
        $.post(
            url,
            {
                csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken').val()
                ,manager_id: drafter_id 
                ,price: proj_price
                ,position: position
            },
            function(data) {
                jsonData = JSON.parse(data);
                if (jsonData.status == 'budgeted') {
                    updateProjectedTeam(jsonData)
                }
            }
            
        )
    }

}


function toggleFavoritePlayer(e) {
    const $playerCell = $(e.target).parent();
    const $playerRow = $playerCell.parent();
    const $playerSpan = $(e.target);
    const action = $playerSpan.hasClass('player-favorite') ? 'unfavorite' : 'favorite'
    let [current_act_price, curr_proj_price, current_player_id, draft_id, drafter_id, current_manager_id, submit_position, current_player_name] = getSubmitData();
    let player_id = $playerRow.attr('player_id');
    let toggleFavUrl = `/draft/favorite_player/${draft_id}/${player_id}/`
    $.post(
        toggleFavUrl,
        {
            csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken').val(),
            action: action
        },
        function(data) {
            jsonData = JSON.parse(data);
            if (jsonData.status == 'favorited') {
                $playerSpan.addClass('player-favorite')
                $playerSpan.text('★')
            } else if (jsonData.status == 'unfavorited') {
                $playerSpan.removeClass('player-favorite')
                $playerSpan.text('☆')

            }
        }
    )
 
}


function setSkepticismRating(e) {
    const $playerCell = $(e.target).parent();
    const $playerRow = $playerCell.parent();
    const $playerInput = $(e.target);
    const rating = $playerInput.val();

    let [current_act_price, curr_proj_price, current_player_id, draft_id, drafter_id, current_manager_id, submit_position, current_player_name] = getSubmitData();
    let player_id = $playerRow.attr('player_id');
    let ratingUrl = `/draft/skepticism_rating/${draft_id}/${player_id}/`
    $.post(
        ratingUrl,
        {
            csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken').val(),
            rating: rating
        },
        function(data) {
            jsonData = JSON.parse(data);
        }
    )
 
}


function formatDraftPick(pId, pos, actPrice, projPrice, playerName) {
    let $playerRow = $(`<tr class="drafted-player" player_id="${pId}" proj-price=${projPrice}></tr>`);
    let cName = $(`<td>${playerName}</td>`);
    let cPos = $(`<td>${pos}</td>`);
    let cCancel = $(`<td class="text-danger text-center" style="cursor: pointer;" onclick="handlePickClick(this, 'undraft')">&#10006;</td>`);
    let cPrice = $(`<td>${actPrice}</td>`);
    $playerRow.append([cName, cPos, cCancel, cPrice]);
    
    let $draftedList = $('.drafted-list');
    $draftedList.append($playerRow);

    let $drafting = $('.drafting');
    $drafting.detach();
}

function formatAvailablePlayer(pId, pos, playerName, projPrice) {
    let $undrafting = $('.undrafting');
    $undrafting.detach();

    let $availableList = $('.available-player-list');
    let $playerRow = $(`<tr class="available-player" player_id="${pId} position=${pos} proj-price=${projPrice}"></tr>`);
    let cName = $(`<td>${playerName}</td>`);
    let cPos = $(`<td>${pos}</td>`);
    let cCancel = $(`<td class="text-danger text-center" style="cursor: pointer;" onclick="handlePickClick(this, 'undraft')">&#10006;</td>`);
    let cPrice = $(`<td>${actPrice}</td>`);
    $availableList.prepend([cName, cPos, cCancel, cPrice]);

}

function allowDrop(ev) {
    ev.preventDefault();
  }
  
function cardDrag(ev) {
    let $src = $(ev.srcElement);
    let data = {
        name: $src.find('td').first().text(),
        position: $src.attr('position'),
        playerId: $src.attr('player_id'),
    }
    $src.addClass('dragging')
    const img = new Image();
    img.src = '/static/images/football.png';
    img.position = 'absolute';
    img.left = '-20px';
    img.top = '-20px';
    ev.dataTransfer.setDragImage(img, -25, -25)

    ev.dataTransfer.setData("text/plain", [
        data
    ]);
}

function cardDrop(ev) {
    ev.preventDefault();
    var data = ev.dataTransfer.getData("text");
}

function cardDragEnd(ev) {
    ev.preventDefault();
    let $src = $(ev.srcElement);
    $src.removeClass('dragging');
}

function dragoverDraft(ev) {
    ev.preventDefault();
    $(ev.target).addClass('draft-drag-over');
}

function dragleaveDraft(ev) {
    ev.preventDefault();
    $(ev.target).removeClass('draft-drag-over');
}

function dropDraft(ev) {
    ev.preventDefault();
    let $target = $(ev.target);
    $target.removeClass('draft-drag-over');
}

function getDraftId() {
    return $('#id_current_draft').attr('current_draft_id')
}

function recalculateBudget() {
    let spent = 0;
    let budget = parseFloat($('.start-budget').text());
    let $projSlots = $('.projected-slot');
    let $slot;
    let price;
    $projSlots.each((idx, slot) => {
        $slot = $(slot);
        price = parseFloat($slot.find('td:nth-child(3)').text());
        if (!isNaN(price)) {
            spent += price;
        }
    })
    let newBudgetAmt = budget - spent;
    $('.projected-budget').text(newBudgetAmt);

}

function toggleFilterType() {
    let $toggle = $('#ap_filter_toggle');
    let types = ['Player', 'Position']
    let current = $toggle.text();
    let index = types.indexOf(current);
    if (index == (types.length - 1)) { 
        index = 0; 
    } else {
        index += 1;
    }
    $toggle.text(types[index]);

}
function clearFilters() {
    $('#ap-filter-player').val('');
    $('#ap-filter-position').val('');
    $('#ap-filter-price').val('');
    $('#ap-filter-weather').val('');
    $('#ap-filter-schedule').val('');
    $('#ap-filter-skepticism').val('');
    $('#ap-filter-offensive-support').val('');
    $('tr.filtered-out').removeClass('filtered-out');
}

function updateModalIcons($row) {
    let rankWeather = $row.find('td.rank-weather').find('span:nth-child(1)').text();
    $('#modal-draft-weather').text(rankWeather);
    let bgWeather = $row.find('td.rank-weather').css('background-color');
    $('#modal-draft-weather').css('background-color', bgWeather)
    
    let rankSchedule = $row.find('td.rank-schedule').find('span:nth-child(1)').text();
    let bgSchedule = $row.find('td.rank-schedule').css('background-color');
    $('#modal-draft-schedule').text(rankSchedule);
    $('#modal-draft-schedule').css('background-color', bgSchedule)
    let rankPlayoffs = $row.find('td.rank-playoffs').find('span:nth-child(1)').text();
    let bgPlayoffs = $row.find('td.rank-playoffs').css('background-color');
    $('#modal-draft-playoffs').text(rankPlayoffs);
    $('#modal-draft-playoffs').css('background-color', bgPlayoffs)
    let rankOLine = $row.find('td.rank-oline').find('span:nth-child(1)').text();
    let bgOLine = $row.find('td.rank-oline').css('background-color');
    $('#modal-draft-oline').text(rankOLine);
    $('#modal-draft-oline').css('background-color', bgOLine)
    let rankVolume = $row.find('td.rank-volume').find('span:nth-child(1)').text();
    let bgVolume = $row.find('td.rank-volume').css('background-color');
    $('#modal-draft-volume').text(rankVolume);
    $('#modal-draft-volume').css('background-color', bgVolume)
    let rankSkepticism = $row.find('td.rank-skepticism').find('input:nth-child(1)').val();
    let bgSkepticism = $row.find('td.rank-skepticism').find('input:nth-child(1)').css('background-color');
    $('#modal-draft-skepticism').text(rankSkepticism);
    $('#modal-draft-skepticism').css('background-color', bgSkepticism)
    
    let isFavorite = $row.find('td.favorite').find('span:nth-child(1)').hasClass('player-favorite');
    let iconFavorite = (isFavorite) ? '★' : '☆';
    $('#modal-draft-favorite').text(iconFavorite);
    $('#modal-draft-favorite').removeClass('player-favorite');
    if (isFavorite) {
        $('#modal-draft-favorite').addClass('player-favorite');
    }
    $('#modal-draft-favorite').text(iconFavorite);
}

function filterPlayers($row) {
    let val = $('#ap-filter-player').val().toLowerCase();
    let pCell = $row.find('td.available-player');
    let playerName = pCell.text().toLowerCase();
    return playerName.indexOf(val) != -1
    }

function filterPosition($row) {
    let val = $('#ap-filter-position').val().toUpperCase();
    let $cell = $row.find('td.available-player');
    let filterKey = 'position-' + val;
    return $cell.hasClass(filterKey)
}

function filterPrice($row) {
    let val = parseInt($('#ap-filter-price').val());
    let $pCell = $row.find('td.rank-price');
    let $span = $pCell.find('span:nth-child(1)');
    let cellValue = parseInt($span.text());
    return cellValue <= val
}

function filterWeather($row) {
    let val = parseInt($('#ap-filter-weather').val());
    let $pCell = $row.find('td.rank-weather');
    let $span = $pCell.find('span:nth-child(1)');
    let cellValue = parseInt($span.text());
    return cellValue <= val
}

function filterSchedule($row) {
    let val = parseInt($('#ap-filter-schedule').val());
    let $pCell = $row.find('td.rank-schedule');
    let $span = $pCell.find('span:nth-child(1)');
    let cellValue = parseInt($span.text());
    return cellValue <= val
}

function filterPlayoffs($row) {
    let val = parseInt($('#ap-filter-playoffs').val());
    let $pCell = $row.find('td.rank-playoffs');
    let $span = $pCell.find('span:nth-child(1)');
    let cellValue = parseInt($span.text());
    return cellValue <= val
}

function filterOLine($row) {
    let val = parseInt($('#ap-filter-oline-ranking').val());
    let $pCell = $row.find('td.rank-oline');
    let $span = $pCell.find('span:nth-child(1)');
    let cellValue = parseInt($span.text());
    return cellValue <= val
}

function filterSkepticism($row) {
    let val = parseInt($('#ap-filter-skepticism').val());
    let $pCell = $row.find('td.rank-skepticism');
    let $input = $pCell.find('input:nth-child(1)');
    let cellValue = parseInt($input.val());
    return cellValue <= val && cellValue != 0
}

function filterOffensiveSupport($row) {
    let val = parseInt($('#ap-filter-offensive-support').val());
    let $pCell = $row.find('td.rank-volume');
    let $span = $pCell.find('span:nth-child(1)');
    let cellValue = parseInt($span.text());
    return cellValue <= val
}

function filterFavorites($row) {
    let $pCell = $row.find('td.favorite');
    let $span = $pCell.find('span:nth-child(1)');
    return $span.hasClass('player-favorite')
}

function filterBudgeted($row) {
    let $pCell = $row.find('td.budgeted');
    let $span = $pCell.find('span:nth-child(1)');
    return $span.text() === 'X';
}

function applyFilters() {
    let playerFilter = $('#ap-filter-player').val().toLowerCase();
    let positionFilter = $('#ap-filter-position').val().toLowerCase();
    let priceFilter = parseInt($('#ap-filter-price').val());
    priceFilter = (isNaN(priceFilter)) ? 0 : priceFilter;
    let weatherFilter = parseInt($('#ap-filter-weather').val());
    weatherFilter = (isNaN(weatherFilter)) ? 0 : weatherFilter;
    let scheduleFilter = parseInt($('#ap-filter-schedule').val());
    scheduleFilter = (isNaN(scheduleFilter)) ? 0 : scheduleFilter;
    let playoffsFilter = parseInt($('#ap-filter-playoffs').val());
    playoffsFilter = (isNaN(playoffsFilter)) ? 0 : playoffsFilter;
    let favoriteFilterBox = document.getElementById('ap-filter-favorite')
    let olineFilter = parseInt($('#ap-filter-oline-ranking').val());
    let skepticismFilter = parseInt($('#ap-filter-skepticism').val());
    let offSupportFilter = parseInt($('#ap-filter-offensive-support').val());
    let budgetFilter = document.getElementById('ap-filter-budget')
    
    let filterList = [];
    if (playerFilter.length > 2) {filterList.push(filterPlayers)}
    if (['qb', 'rb', 'wr', 'te', 'def'].includes(positionFilter)) {filterList.push(filterPosition)}
    if (priceFilter > 0) {filterList.push(filterPrice)}
    if (weatherFilter > 0) {filterList.push(filterWeather)}
    if (scheduleFilter > 0) {filterList.push(filterSchedule)}
    if (playoffsFilter > 0) {filterList.push(filterPlayoffs)}
    if (olineFilter > 0) {filterList.push(filterOLine)}
    if (skepticismFilter > 0) {filterList.push(filterSkepticism)}
    if (offSupportFilter > 0) {filterList.push(filterOffensiveSupport)}
    if (favoriteFilterBox.checked == true) {filterList.push(filterFavorites)}
    if (budgetFilter.checked == true) {filterList.push(filterBudgeted)}
    if (filterList.length == 0) {
        $('tr.filtered-out').removeClass('filtered-out');
        return
    }
    let playerRows = $('tr.available-player');
    playerRows.each((idx, pRow) => {
        let $row = $(pRow);
        let results = []
        for (let i = 0; i < filterList.length; i++) {
            let filterFn = filterList[i];
            let result = filterFn($row);
            results.push(result);
        }
        if (results.includes(false)) {
            $row.addClass('filtered-out');
        } else {
            $row.removeClass('filtered-out');
        }
        }
    )
}
