const SpotifyWebApi = require('spotify-web-api-node');
const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const axios = require("axios");
require('dotenv').config()

const prefix = '+';
const token = process.env.discord_token;

const client = new Discord.Client();

const queue = new Map();

var kicked = false;

client.once("ready", () => {
    console.log("Ready!");
    client.user.setActivity('sad songs 😭')
});

client.once("reconnecting", () => {
    console.log("Reconnecting!");
});

client.once("disconnect", () => {
    console.log("Disconnect!");
});

client.on("message", async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    const serverQueue = queue.get(message.guild.id);

    if (message.content.startsWith(`${prefix}play`)) {
        execute(message, serverQueue);
        purgeLast(message);
        return;
    }
    else if (message.content.startsWith(`${prefix}help`)) {
        help(message);
        purgeLast(message);
        return;
    }
    else if (message.content.startsWith(`${prefix}skip`)) {
        skip(message, serverQueue);
        purgeLast(message);
        return;
    }
    else if (message.content.startsWith(`${prefix}stop`)) {
        stop(message, serverQueue);
        purgeLast(message);
        return;
    }
    else if (message.content.startsWith(`${prefix}queue`)) {
        if (serverQueue == undefined) {
            message.channel.send("There is no queue");
        }
        else {
            sendQueue(message, serverQueue);
            purgeLast(message);
        }
        return;
    }
    else if (message.content.startsWith(`${prefix}shuffle`)) {
        queueShuffle(message, serverQueue);
        purgeLast(message);
    }
    else {
        message.channel.send("You need to enter a valid command!");
    }
});

client.on("voiceStateUpdate", function (oldMember, newMember) {
    if (newMember['id'] == '744308100944625674' && newMember['channelID'] == null) {
        console.log('kicked');
        kicked = true;
        queue.delete(oldMember['guild']['id']);
        client.user.setActivity('sad songs 😭')
    }
});

async function execute(message, serverQueue) {
    const args = message.content.split(" ");

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel)
        return message.channel.send(
            "You need to be in a voice channel to play music!"
        );
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send(
            "I need the permissions to join and speak in your voice channel!"
        );
    }

    if (args[1].indexOf('spotify') > 0) {
        var spotifyApi = new SpotifyWebApi({
            clientId: process.env.spotify_clientId,
            clientSecret: process.env.spotify_clientSecret
        });

        spotifyApi.clientCredentialsGrant()
            .then(async function (data) {
                spotifyApi.setAccessToken(data.body['access_token']);

                var playlist = await getPlaylistId(args);

                spotifyApi.getPlaylistTracks(playlist).then(
                    async function (data) {
                        spotifyApi.getPlaylist(playlist).then(
                            async function (collection) {
                                //console.log(collection.body);

                                client.user.setActivity(collection.body['name'] + ' by ' + collection.body['owner']['display_name']);
                                //message.channel.send('Started playing ' + collection.body['name']);
                                const embed = new Discord.MessageEmbed()
                                    .setColor('#0099ff')
                                    .setTitle('Spotty')
                                    .setDescription('Started playing **' + `[${collection.body['name']}](${collection.body['external_urls']['spotify']})` + '** by ' + collection.body['owner']['display_name'])
                                    .setImage(collection.body['images'][0]['url'])
                                    .setFooter('Spotty - 123kevinlee', 'https://media.discordapp.net/attachments/425848492489965579/744381111773298760/spotify-computer-icons-comparison-of-on-demand-music-streaming-services-streaming-media-png-simple-s.jpg?width=631&height=631');
                                message.channel.send(embed);
                            }
                        );
                        //console.log(data.body);
                        //client.user.setActivity(data.body);
                        var counter = 0;
                        for (var item of data.body['items']) {
                            var songName = item['track']['name'];
                            var artists = '';
                            for (var j = 0; j < item['track']['artists'].length; j++) {
                                artists += item['track']['artists'][j]['name'] + ' ';
                            }
                            //console.log(songName + ' ' + artists);
                            if (kicked == true) {
                                kicked = false;
                                console.log("Ending searches...")
                                break;
                            }
                            await searchSong(songName + ' ' + artists, counter, message);
                            counter++;
                        }
                    },
                    function (err) {
                        console.error(err);
                    }
                )
            }, function (err) {
                console.log('Something went wrong when retrieving an access token', err.message);
            });
    }

    else {
        const songInfo = await ytdl.getInfo(args[1]);
        const song = {
            title: songInfo.videoDetails.title,
            url: songInfo.videoDetails.video_url
        };

        if (!serverQueue) {
            const queueContruct = {
                textChannel: message.channel,
                voiceChannel: voiceChannel,
                connection: null,
                songs: [],
                volume: 5,
                playing: true
            };

            queue.set(message.guild.id, queueContruct);

            queueContruct.songs.push(song);

            try {
                var connection = await voiceChannel.join();
                queueContruct.connection = connection;
                play(message.guild, queueContruct.songs[0]);
            } catch (err) {
                console.log(err);
                queue.delete(message.guild.id);
                return message.channel.send(err);
            }
        } else {
            serverQueue.songs.push(song);
            return message.channel.send(`${song.title} has been added to the queue!`);
        }
    }
}

async function searchSong(query, counter, message) {
    var data = await fetchHTML('https://www.youtube.com/results?search_query=' + query);
    data = data.substring(data.indexOf('/watch?v='));
    data = data.substring(0, data.indexOf('\"'));
    //console.log('https://www.youtube.com' + data);
    if (counter == 0) {
        await spotifyStart('https://www.youtube.com' + data, message);
        //console.log(queue.get(message.guild.id).songs)
        console.log('started playlist');
        await sleep(5000);
    }
    else {
        await spotifyQueue('https://www.youtube.com' + data, queue.get(message.guild.id));
        console.log('added song');
    }
}

async function spotifyStart(url, message) {
    //const args = message.content.split(" ");

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel)
        return message.channel.send(
            "You need to be in a voice channel to play music!"
        );
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send(
            "I need the permissions to join and speak in your voice channel!"
        );
    }

    const songInfo = await ytdl.getInfo(url);
    const song = {
        title: songInfo.videoDetails.title,
        url: songInfo.videoDetails.video_url
    };


    const queueContruct = {
        textChannel: message.channel,
        voiceChannel: voiceChannel,
        connection: null,
        songs: [],
        volume: 5,
        playing: true
    };

    queue.set(message.guild.id, queueContruct);
    queueContruct.songs.push(song);

    try {
        var connection = await voiceChannel.join();
        queueContruct.connection = connection;
        play(message.guild, queueContruct.songs[0]);
        //queue.get(message.guild.id).textChannel.send(`Started Playing: **${song.title}**`);
    } catch (err) {
        console.log(err);
        queue.delete(message.guild.id);
        return message.channel.send(err);
    }
}

async function spotifyQueue(url, serverQueue) {
    const songInfo = await ytdl.getInfo(url);
    const song = {
        title: songInfo.videoDetails.title,
        url: songInfo.videoDetails.video_url
    };
    serverQueue.songs.push(song);
    //serverQueue.textChannel.send(`Queued: **${song.title}**`);
}

function sendQueue(message, serverQueue) {
    var string = '';
    var counter = 0;
    var pages = [];

    if (serverQueue.songs.length < 11) {
        for (var i = 0; i < serverQueue.songs.length; i++) {
            if (counter == 0) {
                string += '** Now Playing: ** ' + serverQueue.songs[i]['title'] + '\n';
            }
            else {
                string += '**' + counter + '.** ' + serverQueue.songs[i]['title'] + '\n';
            }
            counter++;
        }
        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Spotty Music Queue')
            .setDescription(string)
            .setFooter('Spotty - 123kevinlee', 'https://media.discordapp.net/attachments/425848492489965579/744381111773298760/spotify-computer-icons-comparison-of-on-demand-music-streaming-services-streaming-media-png-simple-s.jpg?width=631&height=631');

        message.channel.send(embed);
    }
    else {
        for (var i = 0; i < serverQueue.songs.length; i++) {
            if (counter == 0) {
                string += '** Now Playing: ** ' + serverQueue.songs[i]['title'] + '\n';
            }
            else {
                string += '**' + counter + '.** ' + serverQueue.songs[i]['title'] + '\n';
            }

            if (counter % 10 == 0 && i != 0) {
                string += '\n' + serverQueue.songs.length + ' total songs';
                pages.push(string);
                string = '';
            }

            counter++;
        }
        string += '\n' + serverQueue.songs.length + ' total songs';
        pages.push(string);

        var page = 1;
        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Spotty Music Queue - ' + page + '/' + pages.length)
            .setDescription(pages[page - 1])
            .setFooter('Spotty - 123kevinlee', 'https://media.discordapp.net/attachments/425848492489965579/744381111773298760/spotify-computer-icons-comparison-of-on-demand-music-streaming-services-streaming-media-png-simple-s.jpg?width=631&height=631');

        message.channel.send(embed).then(msg => {
            msg.react('⬅️');
            msg.react('➡️').then(r => {
                const backwardsFilter = (reaction) => reaction.emoji.name == '⬅️';
                const forwardsFilter = (reaction) => reaction.emoji.name == '➡️';

                const backwards = msg.createReactionCollector(backwardsFilter);
                const forwards = msg.createReactionCollector(forwardsFilter);

                backwards.on('collect', r => {
                    if (page == 1) {
                        r.users.remove(r.users.cache.filter(u => !u.bot).first())
                        return;
                    }
                    page--;
                    embed.setDescription(pages[page - 1]);
                    embed.setTitle('Spotty Music Queue - ' + page + '/' + pages.length);
                    msg.edit(embed);
                    r.users.remove(r.users.cache.filter(u => !u.bot).first())
                });

                forwards.on('collect', r => {
                    if (pages[page] == undefined) {
                        r.users.remove(r.users.cache.filter(u => !u.bot).first());
                        return;
                    }
                    page++;
                    embed.setDescription(pages[page - 1]);
                    embed.setTitle('Spotty Music Queue - ' + page + '/' + pages.length);
                    msg.edit(embed);
                    r.users.remove(r.users.cache.filter(u => !u.bot).first());
                });
            });
        });
    }
}

function help(message) {
    const embed = new Discord.MessageEmbed()
        .setColor('#0099ff')
        .setTitle('Spotty Commands')
        .setDescription('+play [spotify url]\n+queue\n+skip\n+stop\n+shuffle')
        .setFooter('Spotty - 123kevinlee', 'https://media.discordapp.net/attachments/425848492489965579/744381111773298760/spotify-computer-icons-comparison-of-on-demand-music-streaming-services-streaming-media-png-simple-s.jpg?width=631&height=631');
    message.channel.send(embed);
}

function queueShuffle(message, serverQueue) {
    var first = serverQueue.songs[0];
    serverQueue.songs.shift();
    var shuffled = shuffle(serverQueue.songs);
    shuffled.unshift(first);
    serverQueue.songs = shuffled;
    message.channel.send("Queue Shuffled!");
}

function shuffle(array) {
    //console.log(array);
    let counter = array.length;

    // While there are elements in the array
    while (counter > 0) {
        // Pick a random index
        let index = Math.floor(Math.random() * counter);

        // Decrease counter by 1
        counter--;

        // And swap the last element with it
        let temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }

    return array;
}

function skip(message, serverQueue) {
    if (!message.member.voice.channel)
        return message.channel.send(
            "You have to be in a voice channel to stop the music!"
        );
    if (!serverQueue)
        return message.channel.send("There is no song that I could skip!");
    serverQueue.connection.dispatcher.end();
    message.channel.send("Song Skipped!");
}

function stop(message, serverQueue) {
    if (!message.member.voice.channel)
        return message.channel.send(
            "You have to be in a voice channel to stop the music!"
        );
    client.user.setActivity('sad songs 😭')
    serverQueue.songs = [];
    serverQueue.connection.dispatcher.end();
    message.channel.send("Music Stopped!");
}

function play(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    const dispatcher = serverQueue.connection
        .play(ytdl(song.url, {
            type: 'opus',
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        }))
        .on("finish", () => {
            serverQueue.songs.shift();
            play(guild, serverQueue.songs[0]);
        })
        .on("error", error => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
    //serverQueue.textChannel.send(`Start playing: **${song.title}**`);
}

async function getPlaylistId(args) {
    //args = args.split(" ");
    var playlist = args[1].substring(args[1].lastIndexOf('/') + 1);
    //console.log(playlist);
    if (playlist.indexOf('?') > 0) {
        playlist = playlist.substring(0, playlist.indexOf('?'));
        //console.log(playlist);
    }
    return playlist;
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function fetchHTML(url) {
    const { data } = await axios.get(encodeURI(url));
    return data;
}

async function purgeLast(message) {
    const fetched = await message.channel.messages.fetch({
        limit: 1,
    });
    message.channel.bulkDelete(fetched)

        .catch(error => message.reply(`Couldn't delete messages because of: ${error}`));
}

client.login(token);
