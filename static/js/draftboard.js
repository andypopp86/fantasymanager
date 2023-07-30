function startDraftBoard() {
    let draft_id = $('#id_current_draft').attr('current_draft_id')
    // let draftSlots = $('.draft-slot');
    // draftSlots.each(function(idx, draftSlot) {
    //     $(draftSlot).on('click', handlePickClick)
    // });
    // let undraftSlots = $('.drafted-player');
    // undraftSlots.each(function(idx, undraftSlot) {
    //     $(undraftSlot).on('click', handlePickClick)
    // });
    // let myUndraftSlots = $('.my-drafted-player');
    // myUndraftSlots.each(function(idx, myUndraftSlot) {
    //     $(myUndraftSlot).on('click', handlePickClick)
    // });
    // let watchedPlayers = $('.watched-player');
    // watchedPlayers.each(function(idx, watchedPlayer) {
    //     $(watchedPlayer).on('click', handlePickClick)
    // })
    $('#save-budget').on('click', saveProjectedTeam)
    $('#save-position-slots').on('click', savePositionSlots)
    $.ajax({
        url: `/draft/board/${draft_id}/json`,
        datatype: 'json',
        type: 'GET',
        data: {
            draft_id: draft_id
        },
        success: function(data) {
            updateDraftBoard(data);
            // updateProjectedTeam(data);
            updatePositionSlots(data);
        }
    })

}
function handlePickClick(e, action) {
    let classList = $(e.target).classList;
    
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
    }
}

// function submitWatch(e) 

//     let player_id = $('#id_current_player').attr('current_player_id')
//     let draft_id = $('#id_current_draft').attr('current_draft_id')
    
//     $(document).unbind('keypress')
//     $('#draft_player_modal').modal({backdrop: false})
//     $('#draft_player_modal').hide()
//     $('.modal-backdrop').hide()
//     $('#draft_player_modal').modal({backdrop: 'static'})

//     let watchPlayerUrl = `/draft/watch_player/${draft_id}/${player_id}/
//     let watchPlayerRequest = $.post(
//         watchPlayerUrl,
//         {
//             csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken').val()
//         },
//         function(data) {
//             if (data.status == 'watched') {
//                 location.reload()
//             }
//         }
//     )
// }

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
                $('<td class="text-danger text-center" style="cursor: pointer;" onclick="handlePickClick(this, "unwatch");">&#10006;</td>').appendTo($watchRow);
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
    $('.available-player').removeClass('drafting');
    $player.addClass('drafting');
    let [position, player_id, proj_price, round_price, player_name, managerId] = extractTargetData($player);
    $('.menu-control').hide();
    $('#menu-control-draft').show();


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
    console.log($player)
    console.log(managerId)
    $('.menu-control').hide();
    $('#menu-control-undraft').show();

    // openDraftModal();
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
                // let $undrafting = $('.undrafting');
                // $undrafting.removeClass('drafted-player');
                // $undrafting.addClass('available-player')
                // $undrafting.detach();
                // $availableList.prepend($undrafting);
                // formatAvailablePlayer(player_id, submit_position, player_name, curr_proj_price);
                $(`#available-player-${jsonData.player_id}`).show();
                let $draftedPlayer = $(`#drafted-player-${jsonData.player_id}`);
                $draftedPlayer.find('.pick-price').text('0');
                let managerId = $draftedPlayer.attr('manager-id');
                
                $draftedPlayer.hide();
                $(`#manager-budget-${managerId}`).text(jsonData['updated_budget'])
                $draftedPlayer.attr('manager-id', '');

                let $boardPlayer = $(`#draft-board-player-${jsonData.player_id}`);
                console.log($boardPlayer)
                console.log(position)
                $boardPlayer.removeClass(`position-${jsonData.position}`);
                $boardPlayer.text('($)');

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
            let $playerRows = $('.available-player');
            let $draftedList = $('.drafted-list');
            if (jsonData.status == 'drafted') {
                $(`#available-player-${jsonData.player_id}`).hide();
                let $draftedPlayer = $(`#drafted-player-${jsonData.player_id}`);
                $draftedPlayer.find('.pick-price').text(current_act_price.val());
                $draftedPlayer.attr('manager-id', current_manager_id)
                $draftedPlayer.show();
                $(`#manager-budget-${current_manager_id}`).text(jsonData['updated_budget'])

                let $draftSlot = $(`[roundid=${jsonData.mgr_player_ct}][columnid=${jsonData.mgr_position}]`)
                console.log($draftSlot)
                $draftSlot.text(`${current_player_name} ($${current_act_price.val()})`)
                $draftSlot.addClass(`position-${submit_position}`)
                $draftSlot.attr('id', `draft-board-player-${jsonData.player_id}`)

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
            // $player_selection.removeClass(positionClass)
            // $player_selection.removeClass('available-player');
            // $player_selection.addClass('drafted-player');
            let undraftPlayerUrl = `/draft/undraft_player/${draft_id}/${player_id}/`
            $player_selection.attr('url', undraftPlayerUrl);

        } else {
            // $player_selection.addClass(positionClass)
            // $player_selection.addClass('available-player');
            // $player_selection.removeClass('drafted-player');
            let draftPlayerUrl = `/draft/draft_player/${draft_id}/${player_id}/`
            $player_selection.attr('url', draftPlayerUrl);


        }
    }
    )
}

function updateBudgets(data) {
    jsonData = JSON.parse(data)
    let draftData = jsonData['data']
    
    let managersDict = draftData['managers_dict']

    // $.each(managersDict, function(manager) {
    // })
}

function updateWatchList(data) {
    jsonData = JSON.parse(data);
    let managersDict = jsonData['data']['managers_dict'];
    $.each(managersDict, function(manager_id, manager) {
        let $manager_budget = $(`[manager_budget_id="${manager_id}"`)
        $manager_budget.text(manager['budget'])
    })
}

// function unwatchPlayer(e) 
//     let player_id = $(e.target).attr('player_id'
//     $('#id_current_player').attr('current_player_id', player_id)
//     $('.modal-backdrop').show()
//     $('#undraft_player_modal').show()
//     $('#undraft_player_modal').modal({backdrop: 'static'})
//     $('body').removeClass('modal-open');
// }

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
        // let $draft_slot_td = $('#projected-slot-' + current_draft_slot_id + ' > td');
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
    let currentBudget = parseInt($('.projected-budget'));
    console.log(currentBudget)
    console.log(jsonData)
    let newBudget = currentBudget - parseInt(jsonData.price);
    $('.projected-budget').text(newBudget)
    let $slot = $(`#projected-slot-${jsonData.slot}`);
    $slot.find('.projected-name').text(jsonData.player_name);
    $slot.find('.projected-spend').text(jsonData.price)
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
    let player_id = $('#id_current_player').attr('current_player_id')
    let player_price = $('#id_current_player').attr('current_proj_price')
    let draft_id = $('#id_current_draft').attr('current_draft_id')
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
    $('.menu-control').hide();
    $('#menu-control-budget').show();


    $('#id_draft_current_manager').val('')
    $('#id_current_price').val('')

    setCurrentPlayerData(player_id, position, player_name, proj_price);
    $('#id_draft_current_manager').find('option').first()[0].selected = true;
    $('#id_current_price').val(round_price);

    openDraftModal();
}

function submitBudgetPick(e) {
    let [current_act_price, curr_proj_price, current_player_id, draft_id, drafter_id, current_manager_id, submit_position, current_player_name] = getSubmitData();
    closeDraftModal();
    // let position = $('#id_draft_player_position').val();
    let url = `/draft/budget_player/${draft_id}/${current_player_id}/`
    if (submit_position != undefined) {
        $.post(
            url,
            {
                csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken').val()
                ,manager_id: current_manager_id 
                ,price: curr_proj_price.val()
                ,position: submit_position
            },
            function(data) {
                jsonData = JSON.parse(data);
                console.log(jsonData)
                if (jsonData.status == 'budgeted') {
                    updateProjectedTeam(jsonData)
                }
            }
            
        )
    }

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