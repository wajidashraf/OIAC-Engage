// Test/UAT administrative helper. Uses the existing OIAC SDK session; never prints credentials.
using System;
using System.IO;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json.Linq;

class ManageActivityAttachmentFlow {
 static readonly Guid Organization = new Guid("3f613eb3-72ea-f011-aa23-6045bd003f09");
 static readonly Guid Flow = new Guid("3d2d6112-bcd2-f111-a059-000d3a35b61f");
 static Entity Read(IOrganizationService service) { return service.Retrieve("workflow", Flow, new ColumnSet("name", "clientdata", "statecode", "ismanaged", "workflowidunique")); }
 static bool Same(string left, string right) { return JToken.DeepEquals(JToken.Parse(left), JToken.Parse(right)); }
 static void State(IOrganizationService service, int state) { service.Execute(new SetStateRequest { EntityMoniker = new EntityReference("workflow", Flow), State = new OptionSetValue(state), Status = new OptionSetValue(state == 1 ? 2 : 1) }); }
 static int Main(string[] args) {
  System.Net.ServicePointManager.SecurityProtocol = System.Net.SecurityProtocolType.Tls12;
  try {
   using (var session = new PacCachedSession()) using (var service = session.CreateSdkClient()) {
    if (((WhoAmIResponse)service.Execute(new WhoAmIRequest())).OrganizationId != Organization) throw new InvalidOperationException("Wrong organization. No mutation performed.");
    var current = Read(service);
    if (current.GetAttributeValue<bool>("ismanaged") || current.GetAttributeValue<string>("name") != "Upload Activity Channel Post Document") throw new InvalidOperationException("Unexpected or managed flow. No mutation performed.");
    if (args.Length == 2 && args[0] == "export") {
     File.WriteAllText(args[1], current.GetAttributeValue<string>("clientdata"));
     Console.WriteLine("Read-only current flow snapshot saved; state: " + current.GetAttributeValue<OptionSetValue>("statecode").Value + "; workflow unique ID: " + current.GetAttributeValue<Guid>("workflowidunique"));
     return 0;
    }
    if (args.Length == 1 && args[0] == "inspect") {
     Console.WriteLine("Supplied flow verified in exact OIAC Test/UAT organization.");
     var query = new QueryExpression("workflow") { ColumnSet = new ColumnSet("name", "clientdata") };
     query.Criteria.AddCondition("category", ConditionOperator.Equal, 5);
     foreach (var row in service.RetrieveMultiple(query).Entities) {
      string data = row.GetAttributeValue<string>("clientdata");
      if (String.IsNullOrEmpty(data) || !data.Contains("mss_sharedsharepointonline_afea2")) continue;
      var json = JObject.Parse(data);
      Console.WriteLine("Existing connector reference example: " + row.GetAttributeValue<string>("name"));
      Console.WriteLine(json["properties"]["connectionReferences"].ToString(Newtonsoft.Json.Formatting.None));
      var sample = ((JContainer)json["properties"]["definition"]["actions"]).Descendants().OfType<JProperty>().FirstOrDefault(p => p.Name == "host");
      if (sample != null) Console.WriteLine(sample.Value.ToString(Newtonsoft.Json.Formatting.None));
      break;
     }
     return 0;
    }
    if (args.Length != 4 || args[0] != "apply" || args[3] != "allow-uat-flow-update") throw new ArgumentException("Expected inspect, or apply <original> <proposed> allow-uat-flow-update.");
    string original = File.ReadAllText(args[1]), proposed = File.ReadAllText(args[2]);
    if (!Same(current.GetAttributeValue<string>("clientdata"), original)) throw new InvalidOperationException("The live flow changed after inspection. No mutation performed.");
    var before = JObject.Parse(original); var after = JObject.Parse(proposed);
    if (!JToken.DeepEquals(before["properties"]["definition"]["triggers"], after["properties"]["definition"]["triggers"])) throw new InvalidOperationException("The original Power Pages trigger must remain unchanged.");
    int initialState = current.GetAttributeValue<OptionSetValue>("statecode").Value;
    try {
     if (initialState == 1) State(service, 0);
     var change = new Entity("workflow", Flow); change["clientdata"] = proposed; service.Update(change);
     State(service, 1);
     var readback = Read(service);
     if (!Same(readback.GetAttributeValue<string>("clientdata"), proposed) || readback.GetAttributeValue<OptionSetValue>("statecode").Value != 1) throw new InvalidOperationException("Activated flow readback does not match the proposed definition.");
     Console.WriteLine("Configured and activated the supplied Test/UAT flow; exact definition readback passed. Flow ID and trigger unchanged.");
    } catch {
     try { State(service, 0); var restore = new Entity("workflow", Flow); restore["clientdata"] = original; service.Update(restore); if (initialState == 1) State(service, 1); Console.Error.WriteLine("Original flow definition restored after unsuccessful update."); } catch (Exception restoreError) { Console.Error.WriteLine("Flow restoration requires attention: " + restoreError.Message); }
     throw;
    }
   }
   return 0;
  } catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
 }
}
