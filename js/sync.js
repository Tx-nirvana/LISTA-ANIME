/* Biblioteca Otaku — camada única de sincronização */
(function(){
'use strict';
async function push(){if(window.OtakuSupabase?.sync)return window.OtakuSupabase.sync('push');return 'Supabase não conectado.'}
async function pull(){if(window.OtakuSupabase?.sync)return window.OtakuSupabase.sync('sync');return 'Supabase não conectado.'}
async function sync(){return pull()}
window.OtakuSync={push,pull,sync,status:()=>window.OtakuSupabase?.session?.()||null};
})();