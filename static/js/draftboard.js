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
    var picks_data = JSON.parse($('#picks_data').text());
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
            $('#ap_filter_toggle').click(toggleFilterType);
            $('#ap_filter').keyup(filterAvailablePlayers);
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
    $('.available-player').removeClass('drafting');
    $player.addClass('drafting');
    let [position, player_id, proj_price, round_price, player_name, managerId] = extractTargetData($player);
    $('.menu-control').hide();
    $('#menu-control-draft').show();

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

            }
            }
    )
}


function unbudgetPlayer(e) {
    const $player = $(e).parent().parent();
    $player.addClass('unbudgeting');
    
    let [current_act_price, curr_proj_price, current_player_id, draft_id, drafter_id, current_manager_id, submit_position, current_player_name] = getSubmitData();
    let player_id = $player.attr('data-player-id');

    let undraftPlayerUrl = `/draft/unbudget_player/${draft_id}/${player_id}/`
    $.post(
        undraftPlayerUrl,
        {
            csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken').val(),
        },
        function(data) {
            jsonData = JSON.parse(data);
            if (jsonData.status == 'unbudgeted') {
                $player.removeClass('position-QB position-RB position-WR position-TE position-DEF');
                $player.find('td:nth-child(2)').find('span:nth-child(1)').text("⚬");
                $player.find('td:nth-child(2)').find('span:nth-child(2)').text("Unassigned");
                $player.find('td:nth-child(3)').text("-");
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

                let $draftSlot = $(`[roundid=${jsonData.mgr_player_ct}][columnid=${jsonData.mgr_position}]`)
                $draftSlot.text(`${current_player_name} ($${current_act_price.val()})`)
                $draftSlot.addClass(`position-${submit_position}`)
                $draftSlot.attr('id', `draft-board-player-${jsonData.player_id}`)
                $(`#draft-board-row-${jsonData.mgr_player_ct}`).show();

            } else if (jsonData.status == 'error') {
                alert(jsonData.error)
            }
            if (jsonData.new_projected_team) {
                updateProjectedTeam(jsonData);
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
    $cancelSpan.css('cursor', 'pointer')
    $cancelSpan.click(handlePickClick('unbudget'))
    
    $slot.find('span:nth-child(2)').text(player.player);
    $slot.find('.projected-name').prepend($cancelSpan);
    $slot.find('.projected-spend').text(player.price);
    $slot.attr('data-player-id', player.id);
}

function emptyBudgetSlot(slot) {
    let $slot = $(`#projected-slot-${slot}`);
    $slot.removeClass('position-QB position-RB position-WR position-TE position-DEF');
    $slot.find('td:nth-child(2)').find('span:nth-child(1)').text("⚬");
    $slot.find('td:nth-child(2)').find('span:nth-child(2)').text("Unassigned");
    $slot.find('td:nth-child(3)').find('span:nth-child(1)').text("-");
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
    let budget = parseInt($('.start-budget').text());
    let $projSlots = $('.projected-slot');
    let $slot;
    let price;
    $projSlots.each((idx, slot) => {
        $slot = $(slot);
        price = parseInt($slot.find('td:nth-child(3)').text());
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
function filterAvailablePlayers() {
    let filterType = $('#ap_filter_toggle').text();
    let val = $('#ap_filter').val().toLowerCase();
    console.log(val)

    if (filterType == 'Player') {
        if (val.length <= 2) {
            $('tr.filtered-out').removeClass('filtered-out');
        } else {
            let playerRows = $('tr.available-player');
            playerRows.each((idx, pRow) => {
                let $row = $(pRow);
                let pCell = $row.find('td:nth-child(1)');
                let playerName = pCell.text().toLowerCase();
                if (playerName.indexOf(val) == -1) {
                    $row.addClass('filtered-out');
                }
            })
        }
    } else if (filterType == 'Position') {
        if (['qb', 'rb', 'wr', 'te', 'def'].indexOf(val) != -1) {
            let filterKey = `position-${val.toUpperCase()}`
            let playerRows = $('tr.available-player');
            playerRows.each((idx, pRow) => {
                let $row = $(pRow);
                let $pCell = $row.find('td:nth-child(1)');
                if ($pCell.hasClass(filterKey)) {
                    $row.removeClass('filtered-out')
                } else {
                    $row.addClass('filtered-out')
                }
            });
        } else {
            $('tr.filtered-out').removeClass('filtered-out');
        }
    }

}