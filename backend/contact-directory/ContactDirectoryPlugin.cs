using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.Serialization.Json;
using System.ServiceModel;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]
[assembly: System.Runtime.Versioning.TargetFramework(".NETFramework,Version=v4.6.2")]
namespace Oiac.Engage.ContactDirectory {
 public sealed class ContactDirectoryPlugin : IPlugin {
  const int PageSize=15, MaxPage=100000, MaxSearch=200, MaxCursor=16384;
  static readonly string[] Fields={"contactid","fullname","emailaddress1","mobilephone","address1_city","mss_district"};
  static readonly string[] SearchFields={"fullname","emailaddress1","mobilephone","address1_city"};
  sealed class Problem:Exception {public string Code;public Problem(string code){Code=code;}}
  static void Fail(string code){throw new Problem(code);}

  public void Execute(IServiceProvider provider) {
   var context=(IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
   try {
    if(context.MessageName!="mss_ContactDistrictDirectory")Fail("validation");
    object actor,search,page,cookie;
    context.InputParameters.TryGetValue("ActorContactId",out actor);
    context.InputParameters.TryGetValue("Search",out search);
    context.InputParameters.TryGetValue("Page",out page);
    context.InputParameters.TryGetValue("Cookie",out cookie);
    if(!(actor is Guid)||(Guid)actor==Guid.Empty)Fail("unauthenticated");
    if(search!=null&&!(search is string)||page!=null&&!(page is int)||cookie!=null&&!(cookie is string))Fail("validation");
    var factory=(IOrganizationServiceFactory)provider.GetService(typeof(IOrganizationServiceFactory));
    // This API accepts ActorContactId only from the trusted Power Pages server logic.
    // The integration user's own Dataverse privileges always govern SDK reads.
    var service=factory.CreateOrganizationService(context.UserId);
    context.OutputParameters["Result"]=Run(service,(Guid)actor,search as string,page==null?1:(int)page,cookie as string);
   }catch(Problem e){context.OutputParameters["Result"]=Error(e.Code);}
   catch{context.OutputParameters["Result"]=Error("unavailable");}
  }

  public static string Run(IOrganizationService service,Guid actor,string search,int page,string cookie) {
   try {
    if(actor==Guid.Empty)Fail("unauthenticated");
    search=search??"";cookie=cookie??"";
    if(search.Length>MaxSearch||page<1||page>MaxPage||cookie.Length>MaxCursor)Fail("validation");
    try{XmlConvert.VerifyXmlChars(search);}catch(XmlException){Fail("validation");}
    string nativeCookie=DecodeCursor(actor,search,page,cookie);
    Entity actorRow;
    try{actorRow=service.Retrieve("contact",actor,new ColumnSet("statecode"));}
    catch(FaultException<OrganizationServiceFault> e){if(e.Detail!=null&&e.Detail.ErrorCode==-2147220969)Fail("forbidden");throw;}
    var state=actorRow==null?null:actorRow.GetAttributeValue<OptionSetValue>("statecode");
    if(state==null||state.Value!=0)Fail("forbidden");

    var rows=service.RetrieveMultiple(new FetchExpression(Fetch(actor,search,page,nativeCookie)));
    string next=null;
    if(rows.MoreRecords){
     if(page==MaxPage||string.IsNullOrEmpty(rows.PagingCookie))Fail("unavailable");
     string cursor=EncodeCursor(actor,search,page+1,rows.PagingCookie);
     next="/_api/serverlogics/contact-directory?q="+Uri.EscapeDataString(search)+"&page="+(page+1).ToString(CultureInfo.InvariantCulture)+"&cookie="+cursor;
    }
    return Json(D("ok",true,"contacts",rows.Entities.Select(e=>(object)Record(e)).ToArray(),"nextLink",next));
   }catch(Problem e){return Error(e.Code);}
   catch{return Error("unavailable");}
  }

  static XElement Eq(string field,object value){return new XElement("condition",new XAttribute("attribute",field),new XAttribute("operator","eq"),new XAttribute("value",value));}
  static string Fetch(Guid actor,string search,int page,string cookie) {
   var entity=new XElement("entity",new XAttribute("name","contact"));
   foreach(string field in Fields)entity.Add(new XElement("attribute",new XAttribute("name",field)));
   entity.Add(new XElement("order",new XAttribute("attribute","fullname")),new XElement("order",new XAttribute("attribute","contactid")));
   var filter=new XElement("filter",new XAttribute("type","and"),Eq("statecode",0));
   if(search.Length>0){
    // Dataverse LIKE is case insensitive. Escape SQL wildcard metacharacters
    // before XElement escapes XML, so every user character remains literal.
    string pattern="%"+search.Replace("[","[[]").Replace("%","[%]").Replace("_","[_]")+"%";
    var matches=new XElement("filter",new XAttribute("type","or"));
    foreach(string field in SearchFields)matches.Add(new XElement("condition",new XAttribute("attribute",field),new XAttribute("operator","like"),new XAttribute("value",pattern)));
    filter.Add(matches);
   }
   entity.Add(filter);
   // EXISTS keeps the root contact unique even when contacts share several
   // districts or duplicate memberships; paging remains native contact paging.
   entity.Add(new XElement("link-entity",new XAttribute("name","mss_contactdistrictmembership"),new XAttribute("from","mss_contact"),new XAttribute("to","contactid"),new XAttribute("alias","matched"),new XAttribute("link-type","exists"),
    new XElement("filter",new XAttribute("type","and"),Eq("statecode",0)),
    new XElement("link-entity",new XAttribute("name","mss_contactdistrictmembership"),new XAttribute("from","mss_district"),new XAttribute("to","mss_district"),new XAttribute("alias","assigned"),new XAttribute("link-type","inner"),
     new XElement("filter",new XAttribute("type","and"),Eq("mss_contact",actor.ToString()),Eq("statecode",0)))));
   var fetch=new XElement("fetch",new XAttribute("count",PageSize),new XAttribute("page",page),entity);
   if(cookie!=null)fetch.Add(new XAttribute("paging-cookie",cookie));
   return fetch.ToString(SaveOptions.DisableFormatting);
  }

  static string EncodeCursor(Guid actor,string search,int page,string cookie) {
   string json=Json(D("actor",actor.ToString(),"search",search,"page",page,"cookie",cookie));
   string token=Convert.ToBase64String(Encoding.UTF8.GetBytes(json)).TrimEnd('=').Replace('+','-').Replace('/','_');
   if(token.Length>MaxCursor)Fail("unavailable");return token;
  }
  static string DecodeCursor(Guid actor,string search,int page,string token) {
   if(page==1){if(token.Length!=0)Fail("validation");return null;}
   if(token.Length==0||!Regex.IsMatch(token,@"\A[A-Za-z0-9_-]+\z"))Fail("validation");
   try {
    string padded=token.Replace('-','+').Replace('_','/');padded=padded.PadRight((padded.Length+3)/4*4,'=');
    byte[] bytes=Convert.FromBase64String(padded);
    // Reject noncanonical encodings and invalid UTF-8 rather than silently
    // replacing bytes before checking the actor/search/page binding.
    if(Convert.ToBase64String(bytes).TrimEnd('=').Replace('+','-').Replace('/','_')!=token)Fail("validation");
    string json=new UTF8Encoding(false,true).GetString(bytes);
    XElement root;
    using(var reader=JsonReaderWriterFactory.CreateJsonReader(Encoding.UTF8.GetBytes(json),new XmlDictionaryReaderQuotas{MaxDepth=4,MaxStringContentLength=MaxCursor,MaxArrayLength=8}))root=XElement.Load(reader);
    if((string)root.Attribute("type")!="object")Fail("validation");
    var values=new Dictionary<string,XElement>();
    foreach(var child in root.Elements()){string key=(string)child.Attribute("item")??child.Name.LocalName;if(values.ContainsKey(key))Fail("validation");values.Add(key,child);}
    if(values.Count!=4||!new[]{"actor","search","page","cookie"}.All(values.ContainsKey))Fail("validation");
    if((string)values["actor"].Attribute("type")!="string"||!string.Equals(values["actor"].Value,actor.ToString(),StringComparison.OrdinalIgnoreCase)||
       (string)values["search"].Attribute("type")!="string"||values["search"].Value!=search||
       (string)values["page"].Attribute("type")!="number"||values["page"].Value!=page.ToString(CultureInfo.InvariantCulture)||
       (string)values["cookie"].Attribute("type")!="string"||string.IsNullOrEmpty(values["cookie"].Value))Fail("validation");
    return values["cookie"].Value;
   }catch(Problem){throw;}
   catch{Fail("validation");return null;}
  }

  static Dictionary<string,object> Record(Entity row) {
   var district=row.GetAttributeValue<EntityReference>("mss_district");
   var result=D("contactid",row.Id.ToString(),"fullname",row.GetAttributeValue<string>("fullname"),"emailaddress1",row.GetAttributeValue<string>("emailaddress1"),"mobilephone",row.GetAttributeValue<string>("mobilephone"),"address1_city",row.GetAttributeValue<string>("address1_city"),"_mss_district_value",district==null?null:district.Id.ToString());
   if(district!=null&&row.FormattedValues.Contains("mss_district"))result.Add("_mss_district_value@OData.Community.Display.V1.FormattedValue",row.FormattedValues["mss_district"]);
   return result;
  }
  static string Error(string code){return Json(D("ok",false,"error",D("code",code,"message",code=="validation"?"Check the search and page values and try again.":code=="unauthenticated"?"Sign in to continue.":code=="forbidden"?"You do not have permission to view this directory.":"The contact directory is temporarily unavailable.")));}
  static Dictionary<string,object> D(params object[] values){var result=new Dictionary<string,object>();for(int i=0;i<values.Length;i+=2)result.Add((string)values[i],values[i+1]);return result;}
  static string Json(object value) {
   if(value==null)return "null";
   var dictionary=value as Dictionary<string,object>;if(dictionary!=null)return "{"+string.Join(",",dictionary.Select(p=>Json(p.Key)+":"+Json(p.Value)))+"}";
   var array=value as object[];if(array!=null)return "["+string.Join(",",array.Select(Json))+"]";
   if(value is bool)return (bool)value?"true":"false";
   if(value is int)return ((int)value).ToString(CultureInfo.InvariantCulture);
   using(var stream=new MemoryStream()){new DataContractJsonSerializer(typeof(string)).WriteObject(stream,(string)value);return Encoding.UTF8.GetString(stream.ToArray());}
  }
 }
}
