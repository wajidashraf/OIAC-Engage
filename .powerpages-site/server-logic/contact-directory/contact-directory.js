// Contact-page read adapter. The actor comes only from the authenticated session.
function get() {
    function fail(code) { throw { directoryCode: code }; }
    function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
    function parse(value) { return typeof value === 'string' ? JSON.parse(value) : value; }
    function guid(value) { return typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) && value !== '00000000-0000-0000-0000-000000000000'; }
    function encode(value) { return encodeURIComponent(value).replace(/[!'()*]/g, (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase()); }
    try {
        const user = Server.User;
        const actor = user && String(user.contactid || user.ContactId || user.Id || user.id || '').trim().replace(/^\{(.+)\}$/, '$1').toLowerCase();
        if (!object(user) || !guid(actor)) fail('unauthenticated');
        const query = Server.Context.QueryParameters || {};
        if (Server.Context.HttpMethod !== 'GET' || !object(query) || Object.keys(query).some((key) => ['q', 'page', 'cookie'].indexOf(key) < 0)) fail('validation');
        if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 200)) fail('validation');
        const search = (query.q || '').trim();
        const pageText = query.page === undefined ? '1' : query.page;
        if (typeof pageText !== 'string' || !/^[1-9]\d*$/.test(pageText) || Number(pageText) > 100000) fail('validation');
        const page = Number(pageText), cookie = query.cookie === undefined ? '' : query.cookie;
        if (typeof cookie !== 'string' || cookie.length > 16384 || (page === 1 ? cookie !== '' : !/^[A-Za-z0-9_-]+$/.test(cookie))) fail('validation');
        const transport = parse(Server.Connector.Dataverse.InvokeCustomApi('post', 'mss_ContactDistrictDirectory', JSON.stringify({ ActorContactId: actor, Search: search, Page: page, Cookie: cookie })));
        if (!object(transport) || !Number.isInteger(transport.StatusCode)) fail('unavailable');
        if (transport.StatusCode === 401 || transport.StatusCode === 403) fail('forbidden');
        if (transport.StatusCode < 200 || transport.StatusCode >= 300 || transport.IsSuccessStatusCode === false || transport.ServerError === true) fail('unavailable');
        const body = parse(transport.Body);
        if (!object(body) || body.error || typeof body.Result !== 'string') fail('unavailable');
        const output = parse(body.Result);
        if (!object(output)) fail('unavailable');
        if (output.ok === false) fail(object(output.error) && ['validation', 'unauthenticated', 'forbidden', 'unavailable'].indexOf(output.error.code) >= 0 ? output.error.code : 'unavailable');
        if (output.ok !== true || !Array.isArray(output.contacts) || output.contacts.length > 15) fail('unavailable');
        const next = output.nextLink;
        if (next !== null) {
            const prefix = '/_api/serverlogics/contact-directory?q=' + encode(search) + '&page=';
            if (typeof next !== 'string' || next.indexOf(prefix) !== 0) fail('unavailable');
            const tail = next.slice(prefix.length).match(/^([1-9]\d*)&cookie=([A-Za-z0-9_-]+)$/);
            if (!tail || Number(tail[1]) !== page + 1 || Number(tail[1]) > 100000 || tail[2].length > 16384) fail('unavailable');
        }
        const fields = ['fullname', 'emailaddress1', 'mobilephone', 'address1_city', '_mss_district_value', '_mss_district_value@OData.Community.Display.V1.FormattedValue'];
        const contacts = output.contacts.map((row) => {
            if (!object(row) || !guid(row.contactid)) fail('unavailable');
            const clean = { contactid: row.contactid };
            fields.forEach((field) => {
                if (row[field] !== undefined) {
                    if (row[field] !== null && typeof row[field] !== 'string') fail('unavailable');
                    clean[field] = row[field];
                }
            });
            return clean;
        });
        return JSON.stringify({ ok: true, contacts: contacts, nextLink: next });
    } catch (error) {
        const code = error && ['validation', 'unauthenticated', 'forbidden', 'unavailable'].indexOf(error.directoryCode) >= 0 ? error.directoryCode : 'unavailable';
        const message = code === 'validation' ? 'Check the Contact search and try again.' : code === 'unauthenticated' ? 'Sign in to view Contacts.' : code === 'forbidden' ? 'You do not have permission to view these Contacts.' : 'Contacts are temporarily unavailable.';
        return JSON.stringify({ ok: false, error: { code: code, message: message } });
    }
}
